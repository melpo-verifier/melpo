const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const crypto = require("node:crypto");
const path = require("node:path");

const REQUIRED_ENV = [
  "S3ACCOUNT_ID",
  "S3ACCESS_KEY_ID",
  "S3SECRET_ACCESS_KEY",
  "S3BUCKET_NAME",
  "S3ENDPOINT",
  "S3PUBLIC_BASE_URL",
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  throw new Error(
    `Missing S3 configuration: ${missingEnv.join(", ")}. Update your environment variables.`,
  );
}

const BUCKET = process.env.S3BUCKET_NAME;
const ACCOUNT_ID = process.env.S3ACCOUNT_ID;
const PUBLIC_BASE = (process.env.S3PUBLIC_BASE_URL || process.env.S3ENDPOINT).replace(/\/$/, "");

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.S3ACCESS_KEY_ID,
    secretAccessKey: process.env.S3SECRET_ACCESS_KEY,
  },
});

const PREFIX_ROOT = "customizations";
const TEMP_FOLDER = "temp";

const isR2ImageResource = (image) =>
  Boolean(image && typeof image === "object" && image.storage === "r2" && image.key);

const sanitizeAppName = (name = "") =>
  name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || "app";

const generateFileId = () => crypto.randomUUID().replace(/-/g, "");

const buildBasePrefix = (serverId, appName) =>
  `${PREFIX_ROOT}/${serverId}/${sanitizeAppName(appName)}`;

const buildSectionPrefix = ({ serverId, appName, section, scope = "final" }) => {
  const base = buildBasePrefix(serverId, appName);
  if (scope === "temp") {
    return `${base}/${TEMP_FOLDER}/${section}/`;
  }
  return `${base}/${section}/`;
};

const buildKey = ({
  serverId,
  appName,
  section,
  extension,
  scope = "temp",
  fileId,
}) => {
  const prefix = buildSectionPrefix({ serverId, appName, section, scope });
  const resolvedFileId = fileId || generateFileId();
  return `${prefix}${resolvedFileId}.${extension}`;
};

const getPublicUrl = (key) => {
  if (!key) {
    return null;
  }
  return `${PUBLIC_BASE}/${key}`;
};

const extractFileIdFromKey = (key) => {
  if (!key) {
    return null;
  }
  return path.basename(key, path.extname(key));
};

const serializeImage = (image) => {
  if (!image) {
    return null;
  }

  return {
    storage: image.storage,
    key: image.key,
    contentType: image.contentType,
    extension: image.extension,
    serverId: image.serverId,
    appName: image.appName,
    section: image.section,
    isTemp: Boolean(image.isTemp),
    fileId: image.fileId || extractFileIdFromKey(image.key),
  };
};

const isTempKey = (key) =>
  Boolean(key && (key.split("/").includes(TEMP_FOLDER) || key.includes("_temp")));

const getFinalKeyFromTemp = (key) => {
  if (!key || !isTempKey(key)) {
    return key;
  }

  const segments = key.split("/");
  const tempIndex = segments.indexOf(TEMP_FOLDER);
  if (tempIndex !== -1) {
    const finalSegments = [...segments];
    finalSegments.splice(tempIndex, 1);
    return finalSegments.join("/");
  }

  return key.replace("_temp", "");
};

async function uploadCustomizationImage({
  serverId,
  appName,
  section,
  buffer,
  contentType,
  extension,
}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("uploadCustomizationImage expects a Buffer");
  }

  const fileId = generateFileId();
  const key = buildKey({
    serverId,
    appName,
    section,
    extension,
    scope: "temp",
    fileId,
  });

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });

  await r2Client.send(command);

  return {
    storage: "r2",
    key,
    url: getPublicUrl(key),
    contentType,
    extension,
    fileName: path.basename(key),
    serverId,
    appName,
    section,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
    isTemp: true,
    fileId,
  };
}

async function promoteCustomizationImage(image) {
  if (!isR2ImageResource(image) || !isTempKey(image.key)) {
    return image;
  }

  const finalKey = getFinalKeyFromTemp(image.key);
  const copyCommand = new CopyObjectCommand({
    Bucket: BUCKET,
    Key: finalKey,
    CopySource: `${BUCKET}/${encodeURIComponent(image.key).replace(/%2F/g, "/")}`,
    ContentType: image.contentType,
    MetadataDirective: "REPLACE",
    CacheControl: "public, max-age=31536000, immutable",
  });

  await r2Client.send(copyCommand);
  await deleteImage(image);

  return serializeImage({
    ...image,
    key: finalKey,
    isTemp: false,
  });
}

async function deleteImage(image) {
  if (!isR2ImageResource(image)) {
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: image.key,
  });

  await r2Client.send(command);
}

async function listSectionObjects({ serverId, appName, section }) {
  const finalPrefix = buildSectionPrefix({ serverId, appName, section, scope: "final" });
  const tempPrefix = buildSectionPrefix({ serverId, appName, section, scope: "temp" });

  const [finalObjects, tempObjects] = await Promise.all([
    listObjectsForPrefix(finalPrefix),
    listObjectsForPrefix(tempPrefix),
  ]);

  return [
    ...finalObjects.map((obj) => ({ ...obj, scope: "final" })),
    ...tempObjects.map((obj) => ({ ...obj, scope: "temp" })),
  ];
}

async function listObjectsForPrefix(prefix) {
  const objects = [];
  let continuationToken;

  do {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    if (response.Contents) {
      objects.push(...response.Contents.filter((obj) => obj?.Key));
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function purgeOldImages({
  serverId,
  appName,
  section,
  keepKey,
  filter = "all",
}) {
  const objects = await listSectionObjects({ serverId, appName, section });
  const keysToDelete = [];
  const scopeFilter =
    filter === "temp"
      ? new Set(["temp"])
      : filter === "final"
        ? new Set(["final"])
        : new Set(["temp", "final"]);

  for (const object of objects) {
    if (!object.Key) {
      continue;
    }
    if (keepKey && object.Key === keepKey) {
      continue;
    }

    if (!scopeFilter.has(object.scope || (isTempKey(object.Key) ? "temp" : "final"))) {
      continue;
    }

    keysToDelete.push(object.Key);
  }

  if (keysToDelete.length === 0) {
    return;
  }

  const chunks = [];
  for (let i = 0; i < keysToDelete.length; i += 1000) {
    chunks.push(keysToDelete.slice(i, i + 1000));
  }

  console.log(`Purging ${keysToDelete.length} images from section ${section} (server: ${serverId}, app: ${appName})`);

  for (const chunk of chunks) {
    await r2Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

module.exports = {
  uploadCustomizationImage,
  promoteCustomizationImage,
  deleteImage,
  purgeOldImages,
  isR2ImageResource,
  getPublicUrl,
  sanitizeAppName,
  serializeImage,
};

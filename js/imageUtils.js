const fs = require("node:fs");
const path = require("node:path");
const { getPublicUrl } = require("./customizationImages.js");

const resolveAbsolutePath = (imagePath) => {
  if (!imagePath) {
    return null;
  }
  if (path.isAbsolute(imagePath)) {
    return imagePath;
  }
  return path.join(process.cwd(), imagePath);
};

const resolveImage = (image, fallbackName = "image") => {
  if (!image) {
    return {
      embedUrl: null,
      filePath: null,
      attachmentName: null,
      isRemote: false,
    };
  }

  if (typeof image === "object" && (image.url || image.key)) {
    const embedUrl = image.url || getPublicUrl(image.key);
    const extensionFromMeta = image.extension || path.extname(image.key || "").slice(1) || "png";
    return {
      embedUrl,
      filePath: null,
      attachmentName: `${fallbackName}.${extensionFromMeta}`,
      isRemote: true,
    };
  }

  const absolutePath = resolveAbsolutePath(image);
  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return {
      embedUrl: null,
      filePath: null,
      attachmentName: null,
      isRemote: false,
    };
  }

  const extension = path.extname(absolutePath).slice(1) || "png";
  const attachmentName = `${fallbackName}.${extension}`;

  return {
    embedUrl: `attachment://${attachmentName}`,
    filePath: absolutePath,
    attachmentName,
    isRemote: false,
  };
};

const isRemoteImage = (image) =>
  Boolean(image && typeof image === "object" && (image.url || image.key));

module.exports = {
  resolveImage,
  isRemoteImage,
};

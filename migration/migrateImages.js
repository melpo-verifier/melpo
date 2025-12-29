const fs = require("fs").promises;
const path = require("path");
const { sequelize, Application } = require("../dbObjects.js");
const { 
  uploadCustomizationImage, 
  promoteCustomizationImage,
  serializeImage,
} = require("../js/customizationImages.js");

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

const IMAGE_CATEGORIES = {
  verifychannelembed: "verifychannelembed",
  startmessage: "startmessage",
  finishmessage: "finishmessage",
  verifymessage: "verifymessage",
  verificationwelcomemessage: "verificationwelcomemessage",
};

const getContentType = (extension) => {
  const types = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  return types[extension.toLowerCase()] || "image/png";
};

async function findLocalImagesInDatabase() {
  try {
    const applications = await Application.findAll();
    const localImages = [];

    for (const app of applications) {
      for (const categoryKey of Object.keys(IMAGE_CATEGORIES)) {
        const messageData = app[categoryKey];
        if (!messageData || typeof messageData !== "object") continue;

        const image = messageData.image;
        if (!image) continue;

        // Check if it's a local file path (string) and not already an S3 resource (object with key)
        if (typeof image === "string") {
          // It's a local image path, needs migration
          localImages.push({
            applicationId: app.id,
            serverId: app.server_id,
            appName: app.name,
            category: categoryKey,
            imagePath: image,
            messageData: messageData,
          });
        }
        // If it's an object with a key property, it's already an S3 image - skip it
      }
    }

    return localImages;
  } catch (error) {
    console.error("Error finding local images in database:", error);
    throw error;
  }
}

async function uploadImageToS3(imagePath, serverId, appName, category) {
  try {
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(process.cwd(), imagePath);

    // Check if file exists
    await fs.access(absolutePath);

    // Read file
    const buffer = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).slice(1) || "png";
    const contentType = getContentType(extension);

    console.log(
      `Uploading ${imagePath} for app "${appName}" in server ${serverId}...`,
    );

    const result = await uploadCustomizationImage({
      serverId,
      appName,
      section: category,
      buffer,
      contentType,
      extension,
    });

    console.log(
      `Successfully uploaded to S3: ${result.key}`,
    );

    return result;
  } catch (error) {
    console.error(`Failed to upload ${imagePath}:`, error.message);
    throw error;
  }
}

async function updateDatabaseEntry(applicationId, category, s3ImageData) {
  try {
    const app = await Application.findByPk(applicationId);
    if (!app) {
      throw new Error(`Application with ID ${applicationId} not found`);
    }

    const messageData = app[category];
    if (!messageData || typeof messageData !== "object") {
      throw new Error(`Message data for category ${category} not found`);
    }

    // Promote the image from temp to final scope
    const promotedImage = await promoteCustomizationImage(s3ImageData);

    if (!promotedImage) {
      throw new Error(`Failed to promote image to final scope for category ${category}`);
    }

    // Serialize and validate the promoted image
    const serializedImage = serializeImage(promotedImage);
    if (!serializedImage || !serializedImage.key) {
      throw new Error(`Failed to serialize promoted image for category ${category}`);
    }

    // Update the message data with the promoted image
    const updatedMessageData = {
      ...messageData,
      image: serializedImage,
    };

    // Save the updated application
    app[category] = updatedMessageData;
    await app.save();

    console.log(
      `Updated database entry for ${category}`,
    );
  } catch (error) {
    console.error(
      `Failed to update database entry for ${category}:`,
      error.message,
    );
    throw error;
  }
}

async function migrateLocalImagesToS3() {
  try {
    const localImages = await findLocalImagesInDatabase();

    if (localImages.length === 0) {
      console.log("No local images found in database.");
      await sequelize.close();
      process.exit(0);
      return;
    }

    console.log(`Found ${localImages.length} images to migrate:\n`);

    let successCount = 0;
    let failureCount = 0;
    const failures = [];

    for (const imageInfo of localImages) {
      try {
        console.log(
          `Processing: ${imageInfo.appName} (${imageInfo.category}) - ${imageInfo.imagePath}`,
        );

        // Upload to S3
        const s3Result = await uploadImageToS3(
          imageInfo.imagePath,
          imageInfo.serverId,
          imageInfo.appName,
          imageInfo.category,
        );

        // Update database
        await updateDatabaseEntry(imageInfo.applicationId, imageInfo.category, s3Result);

        successCount++;
      } catch (error) {
        failureCount++;
        failures.push({
          image: imageInfo.imagePath,
          app: imageInfo.appName,
          category: imageInfo.category,
          error: error.message,
        });
      }
    }

    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);

    if (failures.length > 0) {
      console.log("\nFailed migrations:");
      failures.forEach((failure) => {
        console.log(
          `- ${failure.image} (${failure.app} - ${failure.category}): ${failure.error}`,
        );
      });
    }

    if (failureCount > 0) {
      await sequelize.close();
      process.exit(1);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    try {
      await sequelize.close();
    } catch (closeError) {
      console.error("Error closing database connection:", closeError);
    }
    process.exit(1);
  }
}

migrateLocalImagesToS3();

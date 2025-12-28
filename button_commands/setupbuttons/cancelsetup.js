const { EmbedBuilder } = require("discord.js");
const {
  deleteTempApplication,
} = require("../../js/tempconfigfuncs.js");
const { TempApplication } = require("../../dbObjects.js");
const {
  deleteImage,
  purgeOldImages,
  isR2ImageResource,
} = require("../../js/customizationImages.js");

module.exports = async ({ interaction, context }) => {
  await interaction.deferUpdate();
  const appName = context[0]
  const temporarySetup = await TempApplication.findOne({ where: { name: appName } });

  if (temporarySetup) {
    const tempverifychannelembed = temporarySetup?.verifychannelembed;
    const tempstartmessage = temporarySetup?.startmessage;
    const tempfinishmessage = temporarySetup?.finishmessage;
    const tempverifymessage = temporarySetup?.verifymessage;
    const tempverificationwelcomemessage = temporarySetup?.verificationwelcomemessage;

    if (tempverifychannelembed?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "verifychannelembed",
        tempverifychannelembed.image,
        "images/verifychannelembed",
      );
    if (tempstartmessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "startmessage",
        tempstartmessage.image,
        "images/startmessage",
      );
    if (tempfinishmessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "finishmessage",
        tempfinishmessage.image,
        "images/finishmessage",
      );
    if (tempverifymessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "verifymessage",
        tempverifymessage.image,
        "images/verifymessage",
      );
    if (tempverificationwelcomemessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "verificationwelcomemessage",
        tempverificationwelcomemessage.image,
        "images/verificationwelcomemessage",
      );

    // await deleteTemporarySetup(interaction.guild.id);
    await deleteTempApplication(interaction.guild.id, { name: appName });
  }

  const cancelembed = new EmbedBuilder()
    .setColor("ff0000")
    .setTitle("Setup cancelled")
    .setDescription(
      "The setup has been cancelled. No changes have been made to the server configuration. If you want to start the setup again, use the `/setup` command.",
    );

  await interaction.editReply({
    embeds: [cancelembed],
    components: [],
    files: [],
    content: "",
  });
};

async function deleteNewImage(serverId, appName, section, newImagePath, imageDir) {
  if (isR2ImageResource(newImagePath)) {
    try {
      await deleteImage(newImagePath);
    } catch (error) {
      console.error(`Failed to delete S3 image ${newImagePath.key}:`, error);
    }

    try {
      await purgeOldImages({
        serverId,
        appName,
        section,
        keepKey: null,
        filter: "temp",
      });
    } catch (error) {
      console.error(`Failed to purge temp images for ${section}:`, error);
    }
    return;
  }

  // fs.readdir(imageDir, (err, files) => {
  //   if (err) {
  //     console.error("Failed to list directory contents", err);
  //     return;
  //   }

  //   files.forEach((file) => {
  //     const fileSuffix = path.extname(file);
  //     const fileNameWithoutSuffix = path.basename(file, fileSuffix);
  //     const relativeFilePath = path.join(imageDir, file);
  //     const absoluteFilePath = path.join(
  //       __dirname,
  //       "..",
  //       "..",
  //       relativeFilePath,
  //     );

  //     // Delete files that include _temp in their name
  //     if (fileNameWithoutSuffix.includes("_temp")) {
  //       fs.unlink(absoluteFilePath, (err) => {
  //         if (err) {
  //           console.error(
  //             `Failed to delete temp file ${absoluteFilePath}`,
  //             err,
  //           );
  //         } else {
  //           console.log(`Deleted temp file: ${absoluteFilePath}`);
  //         }
  //       });
  //     }
  //   });
  // });
}

const { EmbedBuilder } = require("discord.js");
const {
  createTemporarySetup,
  deleteTemporarySetup,
} = require("../../js/tempconfigfuncs.js");
const fs = require("fs");
const path = require("path");

module.exports = async ({ interaction }) => {
  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  const tempverifychannelembed = temporarySetup?.verifychannelembed;
  const tempstartmessage = temporarySetup?.startmessage;
  const tempfinishmessage = temporarySetup?.finishmessage;
  const tempverifymessage = temporarySetup?.verifymessage;
  const tempverificationwelcomemessage =
    temporarySetup?.verificationwelcomemessage;

  if (tempverifychannelembed?.image)
    deleteNewImage(
      interaction.guild.id,
      tempverifychannelembed.image,
      "images/verifychannelembed",
    );
  if (tempstartmessage?.image)
    deleteNewImage(
      interaction.guild.id,
      tempstartmessage.image,
      "images/startmessage",
    );
  if (tempfinishmessage?.image)
    deleteNewImage(
      interaction.guild.id,
      tempfinishmessage.image,
      "images/finishmessage",
    );
  if (tempverifymessage?.image)
    deleteNewImage(
      interaction.guild.id,
      tempverifymessage.image,
      "images/verifymessage",
    );
  if (tempverificationwelcomemessage?.image)
    deleteNewImage(
      interaction.guild.id,
      tempverificationwelcomemessage.image,
      "images/verificationwelcomemessage",
    );

  await deleteTemporarySetup(interaction.guild.id);

  const cancelembed = new EmbedBuilder()
    .setColor("ff0000")
    .setTitle("Setup cancelled")
    .setDescription(
      "The setup has been cancelled. No changes have been made to the server configuration. If you want to start the setup again, use the `/setup` command.",
    );

  await interaction.update({
    embeds: [cancelembed],
    components: [],
    files: [],
    content: "",
  });
};

function deleteNewImage(serverId, newImagePath, imageDir) {
  fs.readdir(imageDir, (err, files) => {
    if (err) {
      console.error("Failed to list directory contents", err);
      return;
    }

    files.forEach((file) => {
      const fileSuffix = path.extname(file);
      const fileNameWithoutSuffix = path.basename(file, fileSuffix);
      const relativeFilePath = path.join(imageDir, file);
      const absoluteFilePath = path.join(
        __dirname,
        "..",
        "..",
        relativeFilePath,
      );

      // Delete files that include _temp in their name
      if (fileNameWithoutSuffix.includes("_temp")) {
        fs.unlink(absoluteFilePath, (err) => {
          if (err) {
            console.error(
              `Failed to delete temp file ${absoluteFilePath}`,
              err,
            );
          } else {
            console.log(`Deleted temp file: ${absoluteFilePath}`);
          }
        });
      }
    });
  });
}

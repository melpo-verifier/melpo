const { EmbedBuilder } = require("discord.js");
const {
  deleteTempApplication,
  getTempApplicationById
} = require("../../js/tempconfigfuncs.js");
const {
  deleteImage,
  purgeOldImages,
  isR2ImageResource
} = require("../../js/customizationImages.js");

module.exports = async ({ interaction, context }) => {
  await interaction.deferUpdate();
  const tempApplicationId = parseInt(context[0], 10);
  const { tempApp: temporarySetup } = await getTempApplicationById(tempApplicationId, interaction.guild.id);

  if (temporarySetup) {
    const appName = temporarySetup.name;
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
        "images/verifychannelembed"
      );
    if (tempstartmessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "startmessage",
        tempstartmessage.image,
        "images/startmessage"
      );
    if (tempfinishmessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "finishmessage",
        tempfinishmessage.image,
        "images/finishmessage"
      );
    if (tempverifymessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "verifymessage",
        tempverifymessage.image,
        "images/verifymessage"
      );
    if (tempverificationwelcomemessage?.image)
      await deleteNewImage(
        interaction.guild.id,
        appName,
        "verificationwelcomemessage",
        tempverificationwelcomemessage.image
      );

    await deleteTempApplication(interaction.guild.id, { id: tempApplicationId });
  }

  const cancelembed = new EmbedBuilder()
    .setColor("ff0000")
    .setTitle("Setup cancelled")
    .setDescription(
      "The setup has been cancelled. No changes have been made to the server configuration. If you want to start the setup again, use the `/setup` command."
    );

  await interaction.editReply({
    embeds: [cancelembed],
    components: [],
    files: [],
    content: ""
  });
};

async function deleteNewImage(serverId, appName, section, newImagePath) {
  if (isR2ImageResource(newImagePath)) {
    try 
    { await deleteImage(newImagePath); } 
    catch (error) 
    { console.error(`Failed to delete S3 image ${newImagePath.key}:`, error); }

    try {
      await purgeOldImages({
        serverId,
        appName,
        section,
        keepKey: null,
        filter: "temp"
      });
    } 
    catch (error) 
    { console.error(`Failed to purge temp images for ${section}:`, error); }
    return;
  }
}

const { EmbedBuilder } = require("discord.js");
const { Application } = require("../../dbObjects.js");
const { deleteTempApplication } = require("../../js/tempconfigfuncs.js");
const {
  deleteImage,
  purgeOldImages
} = require("../../js/customizationImages.js");

module.exports = async ({ interaction, context }) => {
  await interaction.deferUpdate();

  const applicationId = parseInt(context[0], 10);

  const application = await Application.findOne(
    { where: { id: applicationId, server_id: interaction.guild.id } }
  );

  if (!application) {
    return interaction.followUp(
      { content: "Application not found or already deleted." }
    );
  }

  const appName = application.name;

  // Clean up images
  const imageFields = [
    "verifychannelembed",
    "startmessage",
    "finishmessage",
    "verifymessage",
    "verificationwelcomemessage"
  ];

  for (const field of imageFields) {
    const fieldData = application[field];
    if (fieldData?.image) {
      try {
        await deleteImage(fieldData.image);
        await purgeOldImages({
          serverId: interaction.guild.id,
          appName,
          section: field,
          keepKey: null
        });
      } 
      catch (error) { 
        console.error(`Failed to delete image for ${field}:`, error); 
      }
    }
  }

  await deleteTempApplication(interaction.guild.id, { applicationId });

  await application.destroy();

  const successEmbed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle("Application Deleted")
    .setDescription(
      `The application "${appName}" has been successfully deleted.`
    );

  await interaction.editReply({
    embeds: [successEmbed],
    components: []
  });
};

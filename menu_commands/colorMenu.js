const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { updateTempApplication, getTempApplicationById } = require("../js/tempconfigfuncs.js");
const customizationMenu = require("./selectcustomizationMenu.js");

module.exports = async ({ interaction, context }) => {
  const customIdValue = context[0];
  const tempApplicationId = parseInt(context[1], 10);

  // Validate tempApplicationId
  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error || !tempApp) { 
    return interaction.reply({ content: error || "Application not found or does not belong to this server.",  flags: 64 }); 
  }

  const value = interaction.values[0];

  if (value !== "custom") {
    await updateTempApplication(interaction.guild.id, { [customIdValue]: { color: value } }, { id: tempApplicationId });
    customizationMenu({ interaction, customIdValue, tempApplicationId });
  } 
  else if (value === "custom") 
  {
    const modal = new ModalBuilder()
      .setCustomId(`setColorModal_${customIdValue}_${tempApplicationId}`)
      .setTitle("Set Embed Color");

    const color = new TextInputBuilder()
      .setCustomId(`color`)
      .setLabel("Set hex color (error -> invalid hex)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Set hex color (e.g., #ffffff or #3f7ff1)")
      .setMinLength(7)
      .setMaxLength(7)
      .setRequired(true);

    const colorRow = new ActionRowBuilder().addComponents(color);
    modal.addComponents(colorRow);

    await interaction.showModal(modal);
  }
};

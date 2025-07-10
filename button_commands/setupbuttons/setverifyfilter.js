const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = async ({ interaction }) => {
  const modal = new ModalBuilder()
    .setCustomId(`verifyfilterModal`)
    .setTitle("Set verify filter words");

  const words = new TextInputBuilder()
    .setCustomId(`blacklistedwords`)
    .setLabel("Blacklisted words, max 18 characters per word")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Every word should be on a new line")
    .setRequired(true)
    .setMaxLength(512);

  const wordsrow = new ActionRowBuilder().addComponents(words);
  modal.addComponents(wordsrow);

  await interaction.showModal(modal);
};

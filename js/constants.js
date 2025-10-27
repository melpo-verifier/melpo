const { ActionRowBuilder, ButtonBuilder } = require("discord.js");

function createCategoryButtons(appName, disabledIndex = -1) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`generalinfo_${appName}`)
      .setLabel("Channels")
      .setStyle("Secondary"),
    new ButtonBuilder()
      .setCustomId(`rolesinfo_${appName}`)
      .setLabel("Roles")
      .setStyle("Secondary"),
    new ButtonBuilder()
      .setCustomId(`questioninfo_${appName}`)
      .setLabel("Questions")
      .setStyle("Secondary"),
    new ButtonBuilder()
      .setCustomId(`customizationinfo_${appName}`)
      .setLabel("Customization")
      .setStyle("Secondary"),
    new ButtonBuilder()
      .setCustomId(`miscinfo_${appName}`)
      .setLabel("Misc")
      .setStyle("Secondary"),
  ];

  if (disabledIndex >= 0 && disabledIndex < buttons.length) {
    buttons[disabledIndex].setDisabled(true);
  }

  return new ActionRowBuilder().addComponents(...buttons);
}

module.exports = { createCategoryButtons };

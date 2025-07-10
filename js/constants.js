const { ActionRowBuilder, ButtonBuilder } = require("discord.js");

const catagorybuttons = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("generalinfo")
    .setLabel("Channels")
    .setStyle("Secondary"),
  new ButtonBuilder()
    .setCustomId("rolesinfo")
    .setLabel("Roles")
    .setStyle("Secondary"),
  new ButtonBuilder()
    .setCustomId("questioninfo")
    .setLabel("Questions")
    .setStyle("Secondary"),
  new ButtonBuilder()
    .setCustomId("customizationinfo")
    .setLabel("Customization")
    .setStyle("Secondary"),
  new ButtonBuilder()
    .setCustomId("miscinfo")
    .setLabel("Misc")
    .setStyle("Secondary"),
);

module.exports = { catagorybuttons };

const {
  SlashCommandBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { ServerConfig } = require("../../dbObjects.js");
const { createTemporarySetup } = require("../../js/tempconfigfuncs.js");

const generalinfo = require("../../button_commands/setupbuttons/generalinfo.js");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up the bot for your server")
    .setContexts(0),
  async execute({ interaction, client }) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.reply({
        content: "You need the `Manage Server` permission to run setup.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const serverConfig = await ServerConfig.findOne({
      where: { server_id: interaction.guild.id },
    });

    const { created } = await createTemporarySetup(interaction.guild.id);

    if (serverConfig && created === false) {
      const ongoingsetup = new EmbedBuilder()
        .setColor("#3f7ff1")
        .setTitle("Melpo Verifier setup")
        .setDescription(
          `There's a previous setup that has not been applied. Would you like to continue with the previous setup or start a new one?\n**(starting a new setup does NOT overwrite already applied configurations)**`,
        );

      const continuebuttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("generalinfo_false")
          .setLabel("Continue previous setup")
          .setStyle("Success"),
        new ButtonBuilder()
          .setCustomId("generalinfo_true")
          .setLabel("Start New Setup")
          .setStyle("Primary"),
      );

      await interaction.reply({
        embeds: [ongoingsetup],
        components: [continuebuttons],
      });
    } else if (serverConfig && created === true) {
      generalinfo({ interaction, client });
    } else {
      const nextbuttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`next_0`)
          .setLabel("Next")
          .setStyle("Primary")
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("cancelsetup")
          .setLabel("Cancel")
          .setStyle("Danger"),
      );

      const generalembed = new EmbedBuilder()
        .setColor("#3f7ff1")
        .setTitle("Melpo Verifier first time setup")
        .setDescription(
          `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nWelcome to the setup of Melpo Verifier! I will guide you through the setup process. I need 4 things to be set up in order to start securing your server. We'll start with the User Verification Start Channel.\n\nPlease select the channel where users will start the verification process and then click the "Next" button below to continue...`,
        )
        .addFields({
          name: "User Verification Channel `(required)`",
          value: `No channel set up yet`,
          inline: false,
        });

      const channelmenu = new ChannelSelectMenuBuilder()
        .setCustomId("firstTimeMenu_0")
        .addChannelTypes("GuildText")
        .setPlaceholder("Select the channel users will start verification in")
        .setMinValues(1)
        .setMaxValues(1);

      const verificationchannelmenu = new ActionRowBuilder().setComponents(
        channelmenu,
      );

      await interaction.reply({
        embeds: [generalembed],
        components: [verificationchannelmenu, nextbuttons],
      });
    }
  },
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");
const { ServerConfig } = require("../../dbObjects.js");
const { deleteTemporarySetup } = require("../../js/tempconfigfuncs.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset your current server configuration")
    .setContexts(0),
  async execute({ interaction }) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.reply({
        content: "You need the `Manage Server` permission to run this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await ServerConfig.destroy({ where: { server_id: interaction.guild.id } });
    await deleteTemporarySetup(interaction.guild.id);

    const Embed = new EmbedBuilder()
      .setColor("#3f7ff1")
      .setTitle("Server configuration reset")
      .setDescription(
        "Your server configuration has been completely reset. You can now run `/setup` to set up the bot again.",
      );

    return interaction.reply({ embeds: [Embed] });
  },
};

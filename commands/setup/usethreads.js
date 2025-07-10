const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { ServerConfig } = require("../../dbObjects.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("usethreads")
    .setDescription(
      "Toggles the use of threads for applications in both review and log channel.",
    )
    .addBooleanOption((option) =>
      option
        .setName("usethreads")
        .setDescription(
          "Enable or disable the use of threads for applications in both review and log channel.",
        )
        .setRequired(true),
    ),
  async execute({ interaction }) {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return interaction.reply({
        content: "You need the `Manage Server` permission to use this command.",
        ephemeral: true,
      });
    }

    try {
      const serverConfig = await ServerConfig.findOne({
        where: { server_id: interaction.guild.id },
      });

      if (!serverConfig) {
        return interaction.reply({
          content:
            "Server configuration not found. Please set up the server configuration first.",
          ephemeral: true,
        });
      }

      const currentState = serverConfig.usethreads;
      const newState = !currentState;

      await serverConfig.update({ usethreads: newState });

      await interaction.reply({
        content: `Thread usage has been **${newState ? "enabled" : "disabled"}** in the server configuration.\nAll applications will now attach a thread in which staff can discuss and all answers to questions will be sent.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error toggling thread usage:", error);
      await interaction.reply({
        content:
          "An error occurred while toggling thread usage. Please try again later.",
        ephemeral: true,
      });
    }
  },
};

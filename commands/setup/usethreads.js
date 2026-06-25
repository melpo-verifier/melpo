const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { Application } = require("../../dbObjects.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("usethreads")
		.setContexts(0)
		.setDescription("Toggles the use of threads for applications in both review and log channel.")
		.addBooleanOption((option) =>
			option
				.setName("usethreads")
				.setDescription("Enable or disable the use of threads for applications in both review and log channel.")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("application")
				.setDescription("The application to toggle threads for (required if multiple exist)")
				.setAutocomplete(true)
				.setRequired(false),
		),
	async autocomplete(interaction) {
		const applications = await Application.findAll({
			where: { server_id: interaction.guild.id },
		});

		const focusedValue = interaction.options.getFocused().toLowerCase();
		const filtered = applications
			.map((app) => app.name)
			.filter((name) => name.toLowerCase().includes(focusedValue))
			.slice(0, 25);

		await interaction.respond(filtered.map((name) => ({ name, value: name })));
	},
	async execute({ interaction }) {
		if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
			return interaction.reply({
				content: "You need the `Manage Server` permission to use this command.",
				flags: MessageFlags.Ephemeral,
			});
		}

		try {
			// Fetch all applications for this guild
			const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });

			if (!applications || applications.length === 0) {
				return interaction.reply({
					content: "No applications configured for this server. Please set up an application using `/setup`.",
					flags: MessageFlags.Ephemeral,
				});
			}

			// Determine which application to use
			let application;
			const appNameOption = interaction.options.getString("application");

			if (applications.length === 1) {
				application = applications[0];
			} else if (appNameOption) {
				application = applications.find((app) => app.name === appNameOption);
				if (!application) {
					return interaction.reply({
						content: `Application "${appNameOption}" not found. Available applications: ${applications.map((a) => a.name).join(", ")}`,
						flags: MessageFlags.Ephemeral,
					});
				}
			} else {
				return interaction.reply({
					content: `Multiple applications exist for this server. Please specify which one to toggle with the \`application\` option.\nAvailable: ${applications.map((a) => a.name).join(", ")}`,
					flags: MessageFlags.Ephemeral,
				});
			}

			const useThreadsOption = interaction.options.getBoolean("usethreads");

			await application.update({ usethreads: useThreadsOption });

			await interaction.reply({
				content: `Thread usage has been **${useThreadsOption ? "enabled" : "disabled"}** for the "${application.name}" application.\nAll applications will now attach a thread in which staff can discuss and all answers to questions will be sent.`,
				flags: MessageFlags.Ephemeral,
			});
		} catch (error) {
			console.error("Error toggling thread usage:", error);
			await interaction.reply({
				content: "An error occurred while toggling thread usage. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});
		}
	},
};

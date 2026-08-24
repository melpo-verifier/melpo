const { SlashCommandBuilder, PermissionsBitField, MessageFlags } = require("discord.js");
const { Application } = require("../../dbObjects.js");
const { checkManagerPermission, isInReviewChannel, verifyUser } = require("../../js/verificationHandler.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("verify")
		.setDescription("verifies (multiple) people")
		.setContexts(0)
		.addStringOption((option) =>
			option
				.setName("users")
				.setDescription("The users to verify (mention them or provide their IDs)")
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("application")
				.setDescription("The application to use for verification (required if multiple exist)")
				.setAutocomplete(true)
				.setRequired(false),
		),

	async autocomplete(interaction) {
		const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });

		const focusedValue = interaction.options.getFocused().toLowerCase();
		const filtered = applications
			.map((app) => app.name)
			.filter((name) => name.toLowerCase().includes(focusedValue))
			.slice(0, 25);

		await interaction.respond(filtered.map((name) => ({ name, value: name })));
	},

	async execute({ interaction, client }) {
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
				content: `Multiple applications exist for this server. Please specify which one to use with the \`application\` option.\nAvailable: ${applications.map((a) => a.name).join(", ")}`,
				flags: MessageFlags.Ephemeral,
			});
		}

		// Check manager permissions
		const permCheck = await checkManagerPermission(interaction, application);
		if (!permCheck.allowed) {
			return interaction.reply({
				content: permCheck.message,
				flags: MessageFlags.Ephemeral,
			});
		}
		if (
			application.managerrole.length === 0 &&
			application.reviewchannel &&
			!isInReviewChannel(interaction, application.reviewchannel)
		) {
			return interaction.reply({
				content: `Please use this command in <#${application.reviewchannel}> or its threads, or set up a manager role in \`/setup\` to use this command everywhere.`,
				flags: MessageFlags.Ephemeral,
			});
		}
		if (!application?.verifiedrole || application.verifiedrole.length === 0) {
			return interaction.reply({
				content: "Please set a verified role in the server configuration by using the `/setup` command",
				flags: MessageFlags.Ephemeral,
			});
		}

		// Check bot permissions
		if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
			return interaction.reply({
				content: "I do not have the required permissions to manage roles",
				flags: MessageFlags.Ephemeral,
			});
		}

		// Parse user IDs
		const usersString = interaction.options.getString("users");
		const userMentions = usersString.match(/<@!?(\d+)>/g) || [];
		const userIds = usersString.match(/\b\d{17,19}\b/g) || [];

		const allUserIds = [
			...new Set([...(userMentions ? userMentions.map((mention) => mention.replace(/[<@!>]/g, "")) : []), ...userIds]),
		];

		if (allUserIds.length === 0) {
			return interaction.reply({
				content: "No valid user mentions or IDs found.",
				flags: MessageFlags.Ephemeral,
			});
		}

		const users = await interaction.guild.members
			.fetch({ user: allUserIds })
			.then((fetched) => Array.from(fetched.values()));

		if (users.length === 0)
			return interaction.reply({ content: "No valid users found in this server.", flags: MessageFlags.Ephemeral });

		if (users.some((user) => user.user.bot))
			return interaction.reply({ content: "You cannot verify a bot.", flags: MessageFlags.Ephemeral });

		await interaction.reply(`Verifying ${users.length} user(s)...`);

		const results = { success: [], notFound: [] };

		for (const user of users) {
			try {
				await verifyUser(interaction, client, application, user);
				results.success.push(user.id);
			} catch (error) {
				console.error(`Could not verify user: ${error}`);
				results.notFound.push(user.id);
			}
		}

		let replyMessage = "";

		if (results.success.length > 0)
			replyMessage += `**Successfully verified:** ${results.success.map((id) => `<@${id}>`).join(", ")}`;

		if (results.notFound.length > 0)
			replyMessage += `\n**Users not found:** ${results.notFound.map((id) => `<@${id}>`).join(", ")}`;

		await interaction.editReply(replyMessage);
	},
};

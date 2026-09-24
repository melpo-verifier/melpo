const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ComponentType } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("server")
		.setDescription("Provides information about the server.")
		.setContexts(0),
	/**
	 * /server command
	 * @param {CommandInteraction} param0 interaction data from discord.js
	 */
	async execute({ interaction }) {
		const guild = interaction.guild; // Grab the guild object from interaction(Garenteed by interaction handler).
		const appMask = interaction.appPermissions ?? 0n; // Grab application bitmask from interaction, defaulting to 0n as a failsafe.
		// Initialise a response, setting components v2 here as all outcomes are the same.
		const response = {
			flags: MessageFlags.IsComponentsV2,
			content: "",
			components: [],
		};

		//--Primary output content--
		const BuildContent = () => {
			let content = "";
			content += `\`Server name\` ${guild.name}\n`;
			content += `\`Server member count\` ${guild.memberCount}\n`;

			return content;
		};

		//--Component array to integrate into a parent or root component list--
		const parts = [
			{ type: ComponentType.TextDisplay, content: "# 🌐Server information" },
			{ type: ComponentType.Separator, divider: true, spacing: 1 },
			{ type: ComponentType.TextDisplay, content: BuildContent() },
		];

		//--Container root element--
		const container = [{ type: ComponentType.Container, components: parts }];

		response.components = container;

		//--If we do not have permission to view channel or send messages, send as a ephemeral as to respect access rights to channels--
		if (!(appMask & PermissionFlagsBits.ViewChannel)) response.flags |= MessageFlags.Ephemeral;
		if (!(appMask & PermissionFlagsBits.SendMessages)) response.flags |= MessageFlags.Ephemeral;

		await interaction.reply(response);
	},
};

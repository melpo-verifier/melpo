const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ComponentType } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder().setName("user").setDescription("Provides information about the user.").setContexts(0),
	/**
	 * /user command
	 * @param {CommandInteraction} param0 interaction data from discord.js
	 */
	async execute({ interaction }) {
		const user = interaction.user; // Grab user from interaction.
		const member = interaction.member; // Grab member from interaction(Garenteed by interaction handler).
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
			const time = Math.floor(member.joinedAt / 1000);
			content += `\`User name\` ${user.username}\n`;
			content += `\`Joined at\` <t:${time}:f>\n`;

			return content;
		};

		//--Component array to integrate into a parent or root component list--
		const parts = [
			{ type: ComponentType.TextDisplay, content: "# 👥User information" },
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

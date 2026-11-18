const { SlashCommandBuilder, MessageFlags, ComponentType } = require("discord.js");

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

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			components: container,
		});
	},
};

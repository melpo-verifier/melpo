const { SlashCommandBuilder, MessageFlags, ComponentType } = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder().setName("user").setDescription("Provides information about the user.").setContexts(0),
	/**
	 * /user command
	 * @param {CommandInteraction} param0 interaction data from discord.js
	 */
	async execute({ interaction }) {
		const user = interaction.user; // Grab user from interaction.
		const member = interaction.member; // Grab member from interaction(Garenteed by interaction handler).

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

		await interaction.reply({
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			components: container,
		});
	},
};

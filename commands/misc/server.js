const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ComponentType } = require("discord.js");

/**
 * /server command
 * @param {CommandInteraction} param0 interaction data from discord.js
 */
async function cmd_server_execute({ interaction }) {
	const cur = {
		channel: "channelID" in interaction ? interaction.channelId : undefined,
		a_perms: "appPermissions" in interaction ? interaction.appPermissions : undefined,
		guild: "guild" in interaction ? interaction.guild : undefined,
	};

	const response = {
		flags: 0,
		content: "",
		components: [],
	};

	if (interaction.inGuild()) {
		const a_perms = cur.a_perms !== undefined ? cur.a_perms.bitfield : 0n;
		response.flags |= MessageFlags.IsComponentsV2;

		//--Primary output content--
		const BuildContent = () => {
			let content = "";
			content += `\`Server name\` ${cur.guild.name}\n`;
			content += `\`Server member count\` ${cur.guild.memberCount}\n`;

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
		if (!(a_perms & PermissionFlagsBits.ViewChannel)) response.flags |= MessageFlags.Ephemeral;
		if (!(a_perms & PermissionFlagsBits.SendMessages)) response.flags |= MessageFlags.Ephemeral;
	} else {
		response.flags |= MessageFlags.Ephemeral;
		response.content = "This command must be ran inside a server.";
	}

	await interaction.reply(response);
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName("server")
		.setDescription("Provides information about the server.")
		.setContexts(0),
	execute: cmd_server_execute,
};

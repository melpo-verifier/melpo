const { SlashCommandBuilder } = require("discord.js");

//Refs:
//JSON struct for response.
//https://discord.js.org/docs/packages/discord.js/14.27.0/InteractionReplyOptions:Interface
//
//Callbacks, from interaction object.
//https://discord.js.org/docs/packages/discord.js/14.27.0/CommandInteraction:Class
//
//Rest calls
//https://discord.js.org/docs/packages/rest/main

//Useful bits:
//https://discord.js.org/docs/packages/discord.js/14.27.0/InteractionReplyOptions:Interface#allowedMentions
//https://discord.js.org/docs/packages/discord.js/14.27.0/MessageMentionOptions:Interface

//MessageFlags.Ephemeral
//MessageFlags.IsComponentsV2

/**
 * /user command
 * @param {CommandInteraction} param0 interaction data from discord.js
 */
async function cmd_user_execute({ interaction }) {
	const cur = {
		channel: "channelID" in interaction ? interaction.channelId : undefined,
		a_perms: "appPermissions" in interaction ? interaction.appPermissions : undefined,
		user: "user" in interaction ? interaction.user : undefined,
		member: "member" in interaction ? interaction.member : undefined,
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
			content += `\`User name\` ${cur.user.username}\n`;
			content += `\`Joined at\` ${cur.member.joinedAt}\n`;
		
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
		if (!(a_perms & PermissionFlagsBits.ViewChannel)) response.flags |= MessageFlags.Ephemeral;
		if (!(a_perms & PermissionFlagsBits.SendMessages)) response.flags |= MessageFlags.Ephemeral;
	} else {
		response.flags |= MessageFlags.Ephemeral;
		response.content = "This command must be ran inside a server.";
	}

	await interaction.reply(response);
}

module.exports = {
	data: new SlashCommandBuilder().setName("user").setDescription("Provides information about the user.").setContexts(0),
	execute: cmd_user_execute,
};

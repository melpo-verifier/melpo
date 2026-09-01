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
		app_perms: "appPermissions" in interaction ? interaction.appPermissions : undefined,
		user: "user" in interaction ? interaction.user : undefined,
		member: "member" in interaction ? interaction.member : undefined,
	};

	const response = {
		//flags: 0,
		content: `This command was run by ${cur.user.username}, who joined on ${cur.member.joinedAt}.`,
		//components: [],
	};

	await interaction.reply(response);
}

module.exports = {
	data: new SlashCommandBuilder().setName("user").setDescription("Provides information about the user.").setContexts(0),
	execute: cmd_user_execute,
};

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ComponentType } = require("discord.js");

//####|###1 1 User scope
//####|##10 2 Moderation scope
//####|#100 4 Management scope
function FormatPermissionNodes(a_perms, scope = 7) {
	let PermList = "";
	//--Special case administrator has full access--
	if (a_perms & PermissionFlagsBits.Administrator) {
		PermList += "- `Administrator(Full access)`\n";
		return PermList;
	}

	//--Management rights[type 2]--
	{
		let ManagePerms = "";
		if (a_perms & PermissionFlagsBits.ManageChannels) ManagePerms += "`⚙️Manage channels`\n";
		if (a_perms & PermissionFlagsBits.ManageGuild) ManagePerms += "`⚙️Manage guild`\n";
		if (a_perms & PermissionFlagsBits.ManageRoles) ManagePerms += "`⚙️Manage roles`\n";
		if (a_perms & PermissionFlagsBits.ManageWebhooks) ManagePerms += "`⚙️Manage webhooks`\n";
		if (a_perms & PermissionFlagsBits.CreateGuildExpressions) ManagePerms += "`⚙️Create expressions`\n";
		if (a_perms & PermissionFlagsBits.ManageGuildExpressions) ManagePerms += "`⚙️Manage expressions`\n";
		if (a_perms & PermissionFlagsBits.ManageEvents) ManagePerms += "`⚙️Manage events`\n";
		if (a_perms & PermissionFlagsBits.ViewAuditLog) ManagePerms += "`⚙️View audit log`\n";
		if (a_perms & PermissionFlagsBits.ViewGuildInsights) ManagePerms += "`⚙️View guild insights`\n";
		if (a_perms & PermissionFlagsBits.CreateEvents) ManagePerms += "`⚙️Create events`\n";
		if (a_perms & PermissionFlagsBits.PinMessages) ManagePerms += "`⚙️Pin messages`\n";
		if (a_perms & PermissionFlagsBits.ViewCreatorMonetizationAnalytics) ManagePerms += "`⚙️View guild monetisation`\n";
		if (ManagePerms.length > 0 && scope & 0x04) PermList += String("- Management Permissions:\n").concat(ManagePerms);
	}
	//--Moderation rights[type 1]--
	{
		let ModPerms = "";
		if (a_perms & PermissionFlagsBits.KickMembers) ModPerms += "`🛡️Kick members`\n";
		if (a_perms & PermissionFlagsBits.BanMembers) ModPerms += "`🛡️Ban members`\n";
		if (a_perms & PermissionFlagsBits.ModerateMembers) ModPerms += "`🛡️Timeout members`\n";
		if (a_perms & PermissionFlagsBits.ManageMessages) ModPerms += "`🛡️Manage messages`\n";
		if (a_perms & PermissionFlagsBits.ManageThreads) ModPerms += "`🛡️Manage threads`\n";
		if (a_perms & PermissionFlagsBits.ManageNicknames) ModPerms += "`🛡️Manage nicknames`\n";
		if (a_perms & PermissionFlagsBits.BypassSlowmode) ModPerms += "`🛡️Bypass slow mode`\n";
		if (a_perms & PermissionFlagsBits.PrioritySpeaker) ModPerms += "`🛡️Priority speaker`\n";
		if (a_perms & PermissionFlagsBits.MentionEveryone) ModPerms += "`🛡️Use everyone/here pings`\n";
		if (a_perms & PermissionFlagsBits.MuteMembers) ModPerms += "`🛡️🔈️Voice chat mute members`\n";
		if (a_perms & PermissionFlagsBits.DeafenMembers) ModPerms += "`🛡️🔈️Voice chat deafen members`\n";
		if (a_perms & PermissionFlagsBits.MoveMembers) ModPerms += "`🛡️🔈️Voice chat move members`\n";
		if (ModPerms.length > 0 && scope & 0x02) PermList += String("- Moderation Permissions:\n").concat(ModPerms);
	}
	//--Misc rights[type 0]--
	{
		let UserPerms = "";
		if (a_perms & PermissionFlagsBits.ViewChannel) UserPerms += "`👥View channel`\n";
		if (a_perms & PermissionFlagsBits.SendMessages) UserPerms += "`👥Send messages`\n";
		if (a_perms & PermissionFlagsBits.SendMessagesInThreads) UserPerms += "`👥Send thread messages`\n";
		if (a_perms & PermissionFlagsBits.CreateInstantInvite) UserPerms += "`👥Create invite`\n";
		if (a_perms & PermissionFlagsBits.ReadMessageHistory) UserPerms += "`👥Read message history`\n";
		if (a_perms & PermissionFlagsBits.CreatePublicThreads) UserPerms += "`👥Create public threads`\n";
		if (a_perms & PermissionFlagsBits.CreatePrivateThreads) UserPerms += "`👥Create private threads`\n";
		if (a_perms & PermissionFlagsBits.UseApplicationCommands) UserPerms += "`👥Use application commands`\n";
		if (a_perms & PermissionFlagsBits.AddReactions) UserPerms += "`👥Add reactions`\n";
		if (a_perms & PermissionFlagsBits.EmbedLinks) UserPerms += "`👥Embed links`\n";
		if (a_perms & PermissionFlagsBits.AttachFiles) UserPerms += "`👥Attach files`\n";
		if (a_perms & PermissionFlagsBits.ChangeNickname) UserPerms += "`👥Change nickname`\n";
		if (a_perms & PermissionFlagsBits.UseExternalEmojis) UserPerms += "`👥Use external emojis`\n";
		if (a_perms & PermissionFlagsBits.UseExternalStickers) UserPerms += "`👥Use external stickers`\n";
		if (a_perms & PermissionFlagsBits.UseEmbeddedActivities) UserPerms += "`👥Use activities`\n";
		if (a_perms & PermissionFlagsBits.UseSoundboard) UserPerms += "`👥Use soundboard`\n";
		if (a_perms & PermissionFlagsBits.UseExternalSounds) UserPerms += "`👥Use external sounds`\n";
		if (a_perms & PermissionFlagsBits.SendVoiceMessages) UserPerms += "`👥Send recorded messages`\n";
		if (a_perms & PermissionFlagsBits.SendTTSMessages) UserPerms += "`👥Send TTS messages`\n";
		if (a_perms & PermissionFlagsBits.SendPolls) UserPerms += "`👥Send polls`\n";
		if (a_perms & PermissionFlagsBits.Connect) UserPerms += "`🔈️Voice chat connecting`\n";
		if (a_perms & PermissionFlagsBits.Speak) UserPerms += "`🔈️Voice chat speaking`\n";
		if (a_perms & PermissionFlagsBits.Stream) UserPerms += "`🔈️Voice chat streaming`\n";
		if (a_perms & PermissionFlagsBits.UseVAD) UserPerms += "`🔈️Voice chat activity detection`\n";
		if (a_perms & PermissionFlagsBits.UseExternalApps) UserPerms += "`👥Use external bots`\n";
		if (UserPerms.length > 0 && scope & 0x01) PermList += String("- User Permissions:\n").concat(UserPerms);
	}

	return PermList;
}

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
			content += `> \`Server name\` ${cur.guild.name}\n`;
			content += `> \`Server member count\` ${cur.guild.memberCount}\n`;
			content += "> `Channel perms`\n";
			content += FormatPermissionNodes(a_perms);

			return content;
		};

		//--Component array to integrate into a parent or root component list--
		const parts = [
			{ type: ComponentType.TextDisplay, content: "# Server command mk2 test" },
			{ type: ComponentType.Separator, divider: true, spacing: 1 },
			{ type: ComponentType.TextDisplay, content: BuildContent() },
		];

		response.components = parts;

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

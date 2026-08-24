const {
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
	ChannelSelectMenuBuilder,
	RoleSelectMenuBuilder,
	MessageFlags,
	PermissionsBitField,
} = require("discord.js");
const { getTempApplicationById } = require("../../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
	await interaction.deferUpdate();
	const nextnumber = parseInt(context[0], 10);
	const tempApplicationId = parseInt(context[1], 10);

	const originalComponents = interaction.message.components;
	const actionRow = originalComponents[1];
	const originalButtons = actionRow.components;

	const nextButton = ButtonBuilder.from(originalButtons[0]);
	nextButton.setDisabled(true);

	const updatedActionRow = new ActionRowBuilder().addComponents(nextButton, originalButtons[1]);
	const { tempApp: temporarySetup, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error) return interaction.editReply({ content: `Error: ${error}`, components: [] });

	if (nextnumber === 0) {
		const channel = await interaction.guild.channels.fetch(temporarySetup.verifychannel).catch(() => null);
		if (channel) {
			const botMember = await interaction.guild.members.fetchMe();
			const botPermissions = channel.permissionsFor(botMember);
			//if (
			//	!botPermissions ||
			//	!botPermissions.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])
			//) {
			if (!botPermissions?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])) {
				return interaction.followUp({
					content: `I don't have the required permissions in the selected channel. Please make sure I have the following channel-specific permissions in <#${temporarySetup.verifychannel}>:\n- View Channel\n- Send Messages\n\nAlso make sure I have all required global permissions using </checkpermissions:1324406378328096890>.`,
					flags: MessageFlags.Ephemeral,
				});
			}
		}

		const verifyChannel = temporarySetup.verifychannel;
		const channelmenu = new ChannelSelectMenuBuilder()
			.setCustomId(`firstTimeMenu_1_${tempApplicationId}`)
			.setChannelTypes("GuildText")
			.setPlaceholder("Channel the applications will be sent to (for mods)")
			.setMinValues(1)
			.setMaxValues(1);

		const selectmenu = new ActionRowBuilder().setComponents(channelmenu);

		//Note : Static invite token.
		const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
			.setDescription(
				`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nGreat! You've set up your user verification channel! Now let's set up the channel where the applications will be sent. This channel will be used to send the applications to the mods for review. Please select the channel where the applications will be sent  and then click the "Next" button below to continue...`,
			)
			.setFields([
				{
					name: "User Verification Channel `(required)`",
					value: `<#${verifyChannel}>`,
					inline: false,
				},
				{
					name: "Verification Review Channel `(required)`",
					value: `No channel set up yet`,
					inline: false,
				},
			]);

		await interaction.editReply({ components: [] });
		try {
			await interaction.message.edit({
				embeds: [updatedEmbed],
				components: [selectmenu, updatedActionRow],
			});
		} catch (error) {
			if (error.code === 50001 || error.code === 50013) {
				return interaction.followUp({
					content:
						"I don't have permission to edit messages in this channel. Please check my permissions and try again.",
					flags: MessageFlags.Ephemeral,
				});
			}
			throw error;
		}
	} else if (nextnumber === 1) {
		const channel = await interaction.guild.channels.fetch(temporarySetup.reviewchannel).catch(() => null);
		if (channel) {
			const botMember = await interaction.guild.members.fetchMe();
			const botPermissions = channel.permissionsFor(botMember);
			//if (
			//	!botPermissions ||
			//	!botPermissions.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])
			//) {
			if (!botPermissions?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])) {
				return interaction.followUp({
					content: `I don't have the required permissions in the selected channel. Please make sure I have the following channel-specific permissions in <#${temporarySetup.reviewchannel}>:\n- View Channel\n- Send Messages\n\nAlso make sure I have all required global permissions using </checkpermissions:1324406378328096890>.`,
					flags: MessageFlags.Ephemeral,
				});
			}
		}

		const reviewChannel = temporarySetup.reviewchannel;
		const verifyChannel = temporarySetup.verifychannel;

		const channelmenu = new RoleSelectMenuBuilder()
			.setCustomId(`firstTimeMenu_2_${tempApplicationId}`)
			.setPlaceholder("Role(s) to be given to verified users")
			.setMinValues(1)
			.setMaxValues(15);

		const selectmenu = new ActionRowBuilder().setComponents(channelmenu);

		//Note : Static invite token.
		const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
			.setDescription(
				`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nAwesome! We've now set up all required channels! Now we just need to add a verified role and a few questions! We'll start with the verified role, this role will be given to users once they've been verified. Please select the role(s) that you would like to be given to users once they've been verified and then click the "Next" button below to continue...\n\n**Note:** If you set up multiple roles, the bot will give all of them to the user.`,
			)
			.setFields([
				{
					name: "User Verification Channel `(required)`",
					value: `<#${verifyChannel}>`,
					inline: false,
				},
				{
					name: "Verification Review Channel `(required)`",
					value: `<#${reviewChannel}>`,
					inline: false,
				},
				{
					name: "Verified Role `(required)`",
					value: `No role set up yet`,
					inline: false,
				},
			]);

		await interaction.editReply({ components: [] });
		try {
			await interaction.message.edit({
				embeds: [updatedEmbed],
				components: [selectmenu, updatedActionRow],
			});
		} catch (error) {
			if (error.code === 50001 || error.code === 50013) {
				return interaction.followUp({
					content:
						"I don't have permission to edit messages in this channel. Please check my permissions and try again.",
					flags: MessageFlags.Ephemeral,
				});
			}
			throw error;
		}
	} else if (nextnumber === 2) {
		//check if all roles are valid and bot can assign them
		const roles = temporarySetup.verifiedrole || [];
		const invalidRoles = [];
		const noPermissionRoles = [];

		const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());

		if (!botMember?.permissions.has("ManageRoles")) {
			return interaction.followUp({
				content: `I don't have the required permissions to assign roles. Please make sure I have the \`Manage Roles\` permission in this server.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		const hasUncachedRoles = roles.some((roleId) => !interaction.guild.roles.cache.has(roleId));
		if (hasUncachedRoles) {
			await interaction.guild.roles.fetch().catch(() => null);
		}

		const botHighest = botMember.roles.highest;

		for (const roleId of roles) {
			const role = interaction.guild.roles.cache.get(roleId);

			if (!role) {
				invalidRoles.push(roleId);
				continue;
			}

			// Hierarchy check
			if (botHighest.comparePositionTo(role) <= 0) {
				noPermissionRoles.push(roleId);
			}
		}

		if (noPermissionRoles.length > 0) {
			return interaction.followUp({
				content: `I don't have permission to assign the selected role(s): ${noPermissionRoles.map((id) => `<@&${id}>`).join(", ")}.\n Please make sure my highest role is above the selected role(s) in the role hierarchy.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (invalidRoles.length > 0) {
			return interaction.followUp({
				content: `The following selected role(s) are invalid: ${invalidRoles.map((id) => `<@&${id}>`).join(", ")}.\n The role might have been deleted during setup, please select valid role(s).`,
				flags: MessageFlags.Ephemeral,
			});
		}

		const firsttimequestions = require("../../js/firsttimequestions.js");

		firsttimequestions({ interaction, applicationId: tempApplicationId });
	}
};

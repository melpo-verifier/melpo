const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");
const { checkManagerPermission } = require("../js/verificationHandler.js");

module.exports = async ({ interaction, client, userid, applicationId }) => {
	if (!userid) throw new Error("Could not fetch user ID from the embed");

	const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
	if (error) {
		return interaction.reply({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	const permCheck = await checkManagerPermission(interaction, application);
	if (!permCheck.allowed) {
		return await interaction.reply({
			content: permCheck.message,
			flags: MessageFlags.Ephemeral,
		});
	}

	const user = await client.users.fetch(userid);
	const modal = new ModalBuilder().setCustomId(`kickModal_${applicationId}_${userid}`).setTitle(`Kick ${user.tag}`);

	const kickInput = new TextInputBuilder()
		.setCustomId("kickInput")
		.setLabel("Please provide a reason for kicking this user")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);

	const kickRow = new ActionRowBuilder().addComponents(kickInput);
	modal.addComponents(kickRow);

	await interaction.showModal(modal);
};

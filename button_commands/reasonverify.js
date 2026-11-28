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
	const modal = new ModalBuilder().setCustomId(`acceptModal_${applicationId}_${userid}`).setTitle(`Accept ${user.tag}`);

	const acceptInput = new TextInputBuilder()
		.setCustomId("acceptInput")
		.setLabel("Please provide a note for accepting this user")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true);

	const acceptRow = new ActionRowBuilder().addComponents(acceptInput);
	modal.addComponents(acceptRow);

	await interaction.showModal(modal);
};

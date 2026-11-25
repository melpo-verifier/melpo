const { ButtonBuilder, ActionRowBuilder, MessageFlags } = require("discord.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js"); //the fallback is temporary for migration since button ids aren't updated into the past.
const { relinkAttachments } = require("../js/verificationHandler.js");

module.exports = async ({ interaction, applicationId, context }) => {
	await interaction.deferUpdate();

	const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
	if (error) {
		return interaction.followUp({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	// Permission check
	if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
		const member = await interaction.guild.members.fetch(interaction.user.id);
		const hasManagerRole = application.managerrole.some((role) => member.roles.cache.has(role));

		if (!hasManagerRole) {
			return interaction.followUp({
				content: `You do not have permission to manage applications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}

	const originalComponents = interaction.message.components;

	// Check if verification already in progress
	if (originalComponents.some((c) => c.components?.some((cc) => cc.customId?.includes("actionconfirm")))) return;

	const applicantId = context?.[1] || "";

	const verifyRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`actionconfirm_${applicationId}_${interaction.user.id}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Confirm Kick")
			.setStyle("Danger"),
		new ButtonBuilder()
			.setCustomId(`reasonaction_${applicationId}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Kick with Reason")
			.setStyle("Danger"),
		new ButtonBuilder()
			.setCustomId(`returntomenu_${applicationId}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Cancel")
			.setStyle("Secondary"),
	);

	const { container, files } = relinkAttachments(interaction.message);
	const editPayload = {
		flags: [MessageFlags.IsComponentsV2],
		components: [container, verifyRow],
	};
	if (files) editPayload.files = files;
	await interaction.editReply(editPayload);
};

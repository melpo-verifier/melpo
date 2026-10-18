const { ButtonBuilder, ActionRowBuilder, MessageFlags } = require("discord.js");
const { getApplicationById } = require("../js/tempconfigfuncs.js");
const { relinkAttachments } = require("../js/verificationHandler.js");

module.exports = async ({ interaction, applicationId, context, userid }) => {
	const applicantId = context?.[1] || userid || "";

	const verify = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`verify_${applicationId}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Accept")
			.setStyle("Success"),
		new ButtonBuilder()
			.setCustomId(`deny_${applicationId}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Deny")
			.setStyle("Danger"),
		new ButtonBuilder()
			.setCustomId(`question_${applicationId}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Question")
			.setStyle("Primary"),
		new ButtonBuilder()
			.setCustomId(`action_${applicationId}${applicantId ? `_${applicantId}` : ""}`)
			.setLabel("Kick")
			.setStyle("Secondary"),
	);

	const { application, error } = await getApplicationById(applicationId, interaction.guild.id);

	if (error) {
		return interaction.reply({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
		const member = await interaction.guild.members.fetch(interaction.user.id);
		const hasManagerRole = application.managerrole.some((role) => member.roles.cache.has(role));

		if (!hasManagerRole) {
			return interaction.reply({
				content: `You do not have permission to manage applications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}

	if (interaction.message?.flags?.has(MessageFlags.IsComponentsV2)) {
		const { container, files } = relinkAttachments(interaction.message);
		const editPayload = { components: [container, verify] };

		if (files) editPayload.files = files;

		if (typeof interaction.update === "function") {
			await interaction.update(editPayload);
		} else if (typeof interaction.message?.edit === "function") {
			await interaction.message.edit(editPayload);
		}
	} else if (interaction.message) {
		const editPayload = { components: [verify] };
		if (typeof interaction.update === "function") {
			await interaction.update(editPayload);
		} else if (typeof interaction.message?.edit === "function") {
			await interaction.message.edit(editPayload);
		}
	}
};

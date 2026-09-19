const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");

module.exports = async ({ interaction }) => {
	if (interaction.user.id !== "808738877945675786") {
		return await interaction.reply({
			content: "You are not authorized to use this command.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const title = interaction.fields.getTextInputValue("broadcastTitle");
	const message = interaction.fields.getTextInputValue("broadcastMessage");

	const color = interaction.fields.getTextInputValue("broadcastColor") || "#F1C40F";
	const image = interaction.fields.getTextInputValue("broadcastImage");

	const previewEmbed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(message).setTimestamp();

	if (image?.startsWith("http")) {
		previewEmbed.setImage(image);
	}

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("melpobroadcastconfirm").setLabel("Confirm").setStyle(ButtonStyle.Success),
		new ButtonBuilder().setCustomId("melpobroadcastcancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
	);

	await interaction.reply({
		content: "Preview:",
		embeds: [previewEmbed],
		components: [row],
		flags: MessageFlags.Ephemeral,
	});
};

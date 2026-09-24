const {
	SlashCommandBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	LabelBuilder,
} = require("discord.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("melpobroadcast")
		.setDescription("Broadcast an announcement to all configured Melpo Logs channels (Owner Only)")
		.setContexts(0),
	async execute({ interaction }) {
		const allowedUsers = ["808738877945675786"];
		if (!allowedUsers.includes(interaction.user.id)) {
			return await interaction.reply({
				content: "You are not authorized to use this command.",
				flags: MessageFlags.Ephemeral,
			});
		}
		const titleInput = new TextInputBuilder()
			.setCustomId("broadcastTitle")
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(256);

		const messageInput = new TextInputBuilder()
			.setCustomId("broadcastMessage")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true)
			.setMaxLength(4000);

		const colorInput = new TextInputBuilder()
			.setCustomId("broadcastColor")
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setMinLength(4)
			.setMaxLength(7);

		const imageInput = new TextInputBuilder()
			.setCustomId("broadcastImage")
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		const modal = new ModalBuilder()
			.setCustomId("melpobroadcastModal")
			.setLabelComponents(
				new LabelBuilder().setLabel("Title").setTextInputComponent(titleInput),
				new LabelBuilder().setLabel("Message").setTextInputComponent(messageInput),
				new LabelBuilder().setLabel("Hex Color").setTextInputComponent(colorInput),
				new LabelBuilder().setLabel("Image URL").setTextInputComponent(imageInput),
			);

		await interaction.showModal(modal);
	},
};

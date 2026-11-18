const {
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require("discord.js");
const { getTempApplicationById } = require("../../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
	const customIdValue = context[0];
	const tempApplicationId = parseInt(context[1], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: error || "Application not found or does not belong to this server.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const currentLabel = tempApp[customIdValue]?.buttonLabel || "Apply";
	const currentStyle = tempApp[customIdValue]?.buttonStyle || "success";

	const modal = new ModalBuilder()
		.setCustomId(`setButtonModal_${customIdValue}_${tempApplicationId}`)
		.setTitle("Set Button");

	const buttonLabelInput = new LabelBuilder()
		.setLabel("Button Label")
		.setDescription("Plain text label for the panel button (max 80 chars, no emoji; empty = Apply)")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId("buttonLabel")
				.setStyle(TextInputStyle.Short)
				.setPlaceholder("Apply")
				.setRequired(false)
				.setMaxLength(80)
				.setValue(currentLabel.slice(0, 80)),
		);

	const buttonStyleSelect = new LabelBuilder()
		.setLabel("Button Style")
		.setDescription("Color style for the panel button")
		.setStringSelectMenuComponent(
			new StringSelectMenuBuilder()
				.setCustomId("buttonStyle")
				.setPlaceholder("Select button color style")
				.setMinValues(1)
				.setMaxValues(1)
				.setRequired(true)
				.setOptions(
					{
						label: "Green (Success)",
						value: "success",
						description: "Success / Green (default)",
						emoji: "🟢",
						default: currentStyle === "success",
					},
					{
						label: "Blurple (Primary)",
						value: "primary",
						description: "Primary / Blurple",
						emoji: "🔵",
						default: currentStyle === "primary",
					},
					{
						label: "Grey (Secondary)",
						value: "secondary",
						description: "Secondary / Grey",
						emoji: "⚪",
						default: currentStyle === "secondary",
					},
					{
						label: "Red (Danger)",
						value: "danger",
						description: "Danger / Red",
						emoji: "🔴",
						default: currentStyle === "danger",
					},
				),
		);

	modal.addLabelComponents(buttonLabelInput, buttonStyleSelect);

	await interaction.showModal(modal);
};

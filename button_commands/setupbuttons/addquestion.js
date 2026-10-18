const { ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, CheckboxBuilder } = require("discord.js");

module.exports = async ({ interaction, context }) => {
	const isfirsttime = parseInt(context[0], 10);
	const tempApplicationId = context?.[1] ?? context?.[0];

	const modal = new ModalBuilder()
		.setCustomId(`addQuestionModal_${isfirsttime}_${tempApplicationId}`)
		.setTitle("Add Question");

	const Question = new LabelBuilder()
		.setLabel("Question")
		.setDescription("Enter the question you want to ask applicants")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId(`question`)
				.setStyle(TextInputStyle.Paragraph)
				.setPlaceholder("Enter your question here")
				.setMaxLength(1024)
				.setRequired(true),
		);

	const MCQ = new LabelBuilder()
		.setLabel("Optional Multiple Choice: 1 option/line")
		.setDescription("List of options. Every option should be on a new line (each option max 100 characters)")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId(`mcq`)
				.setStyle(TextInputStyle.Paragraph)
				.setPlaceholder("List of options. Every option should be on a new line")
				.setRequired(false)
				.setMaxLength(2048),
		);

	const allowMultipleSelections = new LabelBuilder()
		.setLabel("Allow multiple selections for this question")
		.setDescription("Allow users to select multiple options for this question")
		.setCheckboxComponent(new CheckboxBuilder().setCustomId("allowMultipleSelections"));

	modal.addLabelComponents(Question, MCQ, allowMultipleSelections);

	await interaction.showModal(modal);
};

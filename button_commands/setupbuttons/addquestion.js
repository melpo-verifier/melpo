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

	const minSelections = new LabelBuilder()
		.setLabel("Min Selections")
		.setDescription("Minimum number of options an applicant must select (default: 1)")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId("minSelections")
				.setStyle(TextInputStyle.Short)
				.setPlaceholder("1")
				.setValue("1")
				.setRequired(false)
				.setMaxLength(2),
		);

	const maxSelections = new LabelBuilder()
		.setLabel("Max Selections")
		.setDescription("Maximum number of options an applicant can select (default: 1)")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId("maxSelections")
				.setStyle(TextInputStyle.Short)
				.setPlaceholder("1")
				.setValue("1")
				.setRequired(false)
				.setMaxLength(2),
		);

	const allowOther = new LabelBuilder()
		.setLabel("Allow 'Other' option")
		.setDescription("Allow applicants to type a custom answer")
		.setCheckboxComponent(new CheckboxBuilder().setCustomId("allowOther").setDefault(false));

	modal.addLabelComponents(Question, MCQ, minSelections, maxSelections, allowOther);

	await interaction.showModal(modal);
};

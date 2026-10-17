const {
	LabelBuilder,
	CheckboxBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	MessageFlags,
} = require("discord.js");
const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const { getTempApplicationById, getApplicationById } = require("../js/tempconfigfuncs.js");
const { normalizeQuestions } = require("../js/questionSetupUtils.js");

module.exports = async ({ interaction, client, context }) => {
	const isfirsttime = parseInt(context[0], 10);
	const qnumber = parseInt(interaction.values[0], 10) - 1;
	const tempApplicationId = parseInt(context?.[1] ?? context?.[0], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: error || "Application not found.",
			flags: MessageFlags.Ephemeral,
		});
	}

	// If editing an existing application, get the original application for default questions
	let applicationSetup = null;
	if (tempApp.applicationId) {
		const { application } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
		applicationSetup = application;
	}

	const questions = normalizeQuestions(tempApp.questions?.length > 0 ? tempApp.questions : applicationSetup?.questions);

	const question = questions[qnumber];

	const modal = new ModalBuilder()
		.setCustomId(`editQuestionModal_${qnumber}_${isfirsttime}_${tempApplicationId}`)
		.setTitle("Edit or delete question");

	const Question = new LabelBuilder()
		.setLabel("Question")
		.setDescription("Enter the question you want to ask applicants")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId(`question`)
				.setStyle(TextInputStyle.Paragraph)
				.setValue(question.content)
				.setPlaceholder("Enter your question here")
				.setMaxLength(1024)
				.setRequired(false),
		);

	const desc = question.mcq?.length > 0 ? question.mcq.map((option) => option.label ?? option).join("\n") : "";

	const MCQ = new LabelBuilder()
		.setLabel("Optional Multiple Choice: 1 option/line")
		.setDescription("List of options. Every option should be on a new line (each option max 100 characters)")
		.setTextInputComponent(
			new TextInputBuilder()
				.setCustomId(`mcq`)
				.setStyle(TextInputStyle.Paragraph)
				.setPlaceholder("List of options. Every option should be on a new line")
				.setValue(desc.slice(0, 2048))
				.setRequired(false)
				.setMaxLength(2048),
		);

	const allowMultipleSelections = new LabelBuilder()
		.setLabel("Allow multiple selections for this question")
		.setDescription("Allow users to select multiple options for this question instead of just one")
		.setCheckboxComponent(
			new CheckboxBuilder()
				.setCustomId("allowMultipleSelections")
				.setDefault(Boolean(question.allowMultipleSelections)),
		);

	modal.addLabelComponents(Question, MCQ, allowMultipleSelections);

	await interaction.showModal(modal);
	if (isfirsttime === 0) {
		questioninfo({ interaction, client, tempApplicationId });
	} else {
		const firsttimequestions = require("../js/firsttimequestions.js");

		firsttimequestions({ interaction, client, tempApplicationId });
	}
};

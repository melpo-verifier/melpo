const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const { updateTempApplication, getTempApplicationById, getApplicationById } = require("../js/tempconfigfuncs.js");
const { buildQuestionFromForm, normalizeQuestions } = require("../js/questionSetupUtils.js");
const { MessageFlags } = require("discord.js");

module.exports = async ({ interaction, client, context }) => {
	const question = interaction.fields.getTextInputValue("question");
	const mcq = interaction.fields.getTextInputValue("mcq");
	let mcqArray = mcq.split("\n").filter((option) => option.trim().length > 0);
	if (mcqArray.length > 9) mcqArray = mcqArray.slice(0, 9);

	const qnumber = parseInt(context[0], 10);
	const isfirsttime = parseInt(context[1], 10);
	const tempApplicationId = parseInt(context?.[2] ?? context?.[1] ?? context?.[0], 10);

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

	let questions = normalizeQuestions(
		tempApp.questions?.length > 0 ? tempApp.questions : applicationSetup?.questions || [],
	);

	if (question.length > 0) {
		questions[qnumber] = buildQuestionFromForm({
			existingQuestion: questions[qnumber],
			content: question,
			mcqInput: mcqArray,
		});
	} else {
		questions.splice(qnumber, 1);
		questions = questions.filter((q) => q.content.length > 0);
	}

	await updateTempApplication(interaction.guild.id, { questions: questions }, { id: tempApplicationId });

	if (isfirsttime === 0) {
		questioninfo({ interaction, client, tempApplicationId });
	} else {
		const firsttimequestions = require("../js/firsttimequestions.js");

		firsttimequestions({ interaction, client, tempApplicationId });
	}
};

const {
  ActionRowBuilder,
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

  const Question = new TextInputBuilder()
    .setCustomId("question")
    .setLabel("Question (leave empty to delete)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter your question here")
    .setValue(question.content)
    .setMaxLength(1024)
    .setRequired(false);

  const desc = question.mcq?.length > 0 
    ? question.mcq.map((option) => option.label ?? option).join("\n") 
    : "";

  const MCQ = new TextInputBuilder()
    .setCustomId("mcq")
    .setLabel("Multiple Choice Question, 1 option/line max 20 options (leave empty for regular question)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("List of options. Every option should be on a new line")
    .setValue(desc.slice(0, 2048))
    .setMaxLength(2048)
    .setRequired(false);

  const questionRow = new ActionRowBuilder().addComponents(Question);
  const mcqRow = new ActionRowBuilder().addComponents(MCQ);
  modal.addComponents(questionRow, mcqRow);

  await interaction.showModal(modal);
  if (isfirsttime === 0) {
    questioninfo({ interaction, client, tempApplicationId });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction, client, tempApplicationId });
  }
};

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { ServerConfig } = require("../dbObjects.js");
const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const { createTemporarySetup } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, context }) => {
  const isfirsttime = parseInt(context);
  const qnumber = parseInt(interaction.values[0]) - 1;

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  var questions = temporarySetup.questions || serverConfig.questions;

  // Check if questions is an array of strings and parse
  if (
    Array.isArray(questions) &&
    questions.every((q) => typeof q === "string")
  ) {
    try {
      questions = questions?.map((q) => JSON.parse(q));
    } catch (error) {
      questions = [];
      throw error;
    }
  }

  const question = questions[qnumber];

  const modal = new ModalBuilder()

    .setCustomId(`editQuestionModal_${qnumber}_${isfirsttime}`)
    .setTitle("Edit or delete question");

  const Question = new TextInputBuilder()
    .setCustomId("question")
    .setLabel("Question (leave empty to delete)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter your question here")
    .setValue(question.content)
    .setMaxLength(512)
    .setRequired(false);

  const MCQ = new TextInputBuilder()
    .setCustomId("mcq")
    .setLabel("Multiple Choice Question, 1 option/line max 9")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("List of options. Every option should be on a new line")
    .setValue(question.mcq.join("\n") || "")
    .setMaxLength(512)
    .setRequired(false);

  const questionRow = new ActionRowBuilder().addComponents(Question);
  const mcqRow = new ActionRowBuilder().addComponents(MCQ);
  modal.addComponents(questionRow, mcqRow);

  await interaction.showModal(modal);
  if (isfirsttime === 0) {
    questioninfo({ interaction, client });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction, client });
  }
};

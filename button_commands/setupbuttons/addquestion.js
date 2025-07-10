const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

module.exports = async ({ interaction, context }) => {
  const isfirsttime = parseInt(context[0]);

  const modal = new ModalBuilder()
    .setCustomId(`addQuestionModal_${isfirsttime}`)
    .setTitle("Add Question");

  const Question = new TextInputBuilder()
    .setCustomId(`question`)
    .setLabel("Question")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter your question here")
    .setRequired(true)
    .setMaxLength(512);

  const MCQ = new TextInputBuilder()
    .setCustomId(`mcq`)
    .setLabel("Multiple Choice Question, 1 option/line max 9")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("List of options. Every option should be on a new line")
    .setRequired(false)
    .setMaxLength(512);

  const questionRow = new ActionRowBuilder().addComponents(Question);
  const mcqRow = new ActionRowBuilder().addComponents(MCQ);
  modal.addComponents(questionRow, mcqRow);

  await interaction.showModal(modal);
};

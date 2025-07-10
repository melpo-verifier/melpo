const { ServerConfig } = require("../dbObjects.js");
const {
  createTemporarySetup,
  updateTemporarySetup,
} = require("../js/tempconfigfuncs.js");
const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");

module.exports = async ({ interaction, client, context }) => {
  const question = interaction.fields.getTextInputValue("question");
  const mcq = interaction.fields.getTextInputValue("mcq");
  let mcqArray = mcq.split("\n").filter((option) => option.trim().length > 0); // Filter out empty strings
  if (mcqArray.length > 9) {
    mcqArray = mcqArray.slice(0, 9);
  }

  const isfirsttime = parseInt(context[1]);
  const qnumber = parseInt(context[0]);

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  var questions = temporarySetup.questions || serverConfig.questions;
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

  if (question.length > 0) {
    questions[qnumber] = { content: question, mcq: mcqArray };
  } else {
    questions.splice(qnumber, 1);
    questions = questions.filter((q) => q.content.length > 0);
  }

  await updateTemporarySetup(interaction.guild.id, { questions: questions });

  if (isfirsttime === 0) {
    questioninfo({ interaction, client });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction, client });
  }
};

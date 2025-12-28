const { Application } = require("../dbObjects.js");
const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const { createTempApplication, updateTempApplication } = require("../js/tempconfigfuncs.js");


module.exports = async ({ interaction, client, context }) => {
  const question = interaction.fields.getTextInputValue("question");
  const mcq = interaction.fields.getTextInputValue("mcq");
  let mcqArray = mcq.split("\n").filter((option) => option.trim().length > 0);
  if (mcqArray.length > 9) {
    mcqArray = mcqArray.slice(0, 9);
  }

  const isfirsttime = parseInt(context[1], 10);
  const qnumber = parseInt(context[0], 10);
  const appName = context?.[2] ?? context?.[1] ?? context?.[0];

  const applicationSetup = await Application.findOne({ where: { name: appName } });

  const { tempApp } = await createTempApplication(interaction.guild.id, { name: appName });

  var questions = tempApp.questions?.length > 0 ? tempApp.questions : applicationSetup.questions;
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

  await updateTempApplication(interaction.guild.id, {
    questions: questions,
  }, { name: appName });

  if (isfirsttime === 0) {
    questioninfo({ interaction, client, appName });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction, client, appName });
  }
};

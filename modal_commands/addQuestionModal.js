const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const {
  createTemporarySetup,
  updateTemporarySetup,
} = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, context }) => {
  const isfirsttime = parseInt(context[0]);

  const question = interaction.fields.getTextInputValue(`question`);
  const mcq = interaction.fields.getTextInputValue(`mcq`);
  var mcqArray = mcq ? mcq.split("\n") : [];

  if (mcqArray.length > 9) {
    mcqArray = mcqArray.slice(0, 9);
  }

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  if (!temporarySetup.questions) {
    temporarySetup.questions = [];
  }

  temporarySetup.questions.push({ content: question, mcq: mcqArray });

  temporarySetup.questions = temporarySetup.questions
    ?.map((q) => {
      if (typeof q === "string") {
        try {
          return JSON.parse(q);
        } catch (error) {
          console.error("Failed to parse question:", error);
          return null;
        }
      }
      return q;
    })
    .filter((q) => q !== null);

  await updateTemporarySetup(interaction.guild.id, {
    questions: temporarySetup.questions,
  });

  if (isfirsttime === 0) {
    questioninfo({ interaction, client });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction });
  }
};

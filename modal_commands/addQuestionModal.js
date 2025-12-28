const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const {
  updateTempApplication,
} = require("../js/tempconfigfuncs.js");
const { TempApplication } = require("../dbObjects.js");

module.exports = async ({ interaction, client, context }) => {
  const isfirsttime = parseInt(context[0]);
  let appName = context?.[1] ?? context?.[0];

  if (!appName) {
    return interaction.reply({
      content: 'Application name is missing. Please try again.',
      ephemeral: true,
    });
  }

  const question = interaction.fields.getTextInputValue(`question`);
  const mcq = interaction.fields.getTextInputValue(`mcq`);
  var mcqArray = mcq ? mcq.split("\n") : [];

  if (mcqArray.length > 9) {
    mcqArray = mcqArray.slice(0, 9);
  }

  // const { temporarySetup } = await createTemporarySetup(interaction.guild.id);
  const temporarySetup = await TempApplication.findOne({ where: { name: appName } });

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

  await updateTempApplication(interaction.guild.id, {
    questions: temporarySetup.questions,
  }, { name: appName });

  if (isfirsttime === 0) {
    questioninfo({ interaction, client, appName });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction, appName });
  }
};

const questioninfo = require("../button_commands/setupbuttons/questioninfo.js");
const {
  updateTempApplication,
  getTempApplicationById,
} = require("../js/tempconfigfuncs.js");
const { MessageFlags } = require("discord.js");

module.exports = async ({ interaction, client, context }) => {
  const isfirsttime = parseInt(context[0]);
  let tempApplicationId = parseInt(context?.[1] ?? context?.[0], 10);

  if (!tempApplicationId || isNaN(tempApplicationId)) {
    return interaction.reply({
      content: 'Temp Application ID is missing. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const question = interaction.fields.getTextInputValue(`question`);
  const mcq = interaction.fields.getTextInputValue(`mcq`);
  let mcqArray = mcq ? mcq.split("\n") : [];

  if (mcqArray.length > 9) {
    mcqArray = mcqArray.slice(0, 9);
  }

  const { tempApp: temporarySetup, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error || !temporarySetup) {
    return interaction.reply({
      content: error || 'Temporary setup not found. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

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
  }, { id: tempApplicationId });

  if (isfirsttime === 0) {
    questioninfo({ interaction, client, tempApplicationId });
  } else {
    const firsttimequestions = require("../js/firsttimequestions.js");

    firsttimequestions({ interaction, tempApplicationId });
  }
};

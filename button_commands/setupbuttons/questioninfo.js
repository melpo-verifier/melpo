const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const {
  updateTempApplication,
  getApplicationById,
  getTempApplicationById,
} = require("../../js/tempconfigfuncs.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, applicationId, tempApplicationId }) => {
  tempApplicationId = tempApplicationId ?? applicationId ?? (context?.[0] ? parseInt(context[0], 10) : null);

  if (!tempApplicationId) {
    return interaction.reply({
      content: 'Temp Application ID is missing. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const questionembed = new EmbedBuilder()
    .setTitle("Questions setup")
    .setDescription(
      "[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nHere you can view and edit the questions that will be asked to users when they apply for verification.",
    )
    .setColor("#0099ff");


  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  let applicationSetup = null;
  if (tempApp.applicationId) {
    const { application } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
    applicationSetup = application;
  }

  let questions = tempApp.questions?.length > 0 ? tempApp.questions : applicationSetup?.questions;
  await updateTempApplication(interaction.guild.id, { questions: questions }, { id: tempApplicationId });

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

  const questionbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`addquestion_0_${tempApplicationId}`)
      .setLabel("Add Question")
      .setStyle("Primary"),
  );

  const finishbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("finishsetup_" + tempApplicationId)
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup_" + tempApplicationId)
      .setLabel("Cancel")
      .setStyle("Danger"),
    // new ButtonBuilder()
    //   .setLabel("Configure on dashboard")
    //   .setStyle("Link")
    //   .setURL(
    //     `https://melpo.app/dashboard/${interaction.guild.id}`,
    //   ),
  );

  const editmenu = new ActionRowBuilder();

  if (questions && questions.length > 0) {
    questions = questions?.map((question) => {
      return question;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("questionSelectMenu_0_" + tempApplicationId)
      .setPlaceholder("Select a question to edit or delete")
      .setMinValues(1)
      .setMaxValues(1);

    questions.forEach((question, index) => {
      selectMenu.addOptions({
        label:
          question.content.length > 100
            ? question.content.slice(0, 97) + "..."
            : question.content,
        description:
          question.mcq.join("; ").length > 100
            ? question.mcq.join("; ").slice(0, 97) + "..."
            : question.mcq.join("; ") || "No multiple choice question",
        value: `${index + 1}`,
      });
    });

    editmenu.addComponents(selectMenu);

    questionembed.addFields(
      questions?.map((question, index) => {
        const mcqContent =
          question.mcq?.length > 0 ? `\n- ${question.mcq.join("\n- ")}` : "";
        return {
          name: `Question ${index + 1}`,
          value: (question.content + mcqContent).slice(0, 1024),
          inline: false,
        };
      }),
    );

    const categoryButtons = createCategoryButtons(tempApplicationId, 2); // 2 = Questions is disabled

    if (interaction.replied || interaction.deferred) {
      interaction.message.edit({
        content: "",
        embeds: [questionembed],
        components: [categoryButtons, editmenu, questionbuttons, finishbuttons],
        files: [],
      });
    } else {
      interaction.update({
        content: "",
        embeds: [questionembed],
        components: [categoryButtons, editmenu, questionbuttons, finishbuttons],
        files: [],
      });
    }
  } else {
    const categoryButtons = createCategoryButtons(tempApplicationId, 2); // 2 = Questions is disabled
    
    interaction.update({
      content: "",
      embeds: [questionembed],
      components: [categoryButtons, questionbuttons, finishbuttons],
      files: [],
    });
  }
};
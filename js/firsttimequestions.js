const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { createTemporarySetup } = require("./tempconfigfuncs.js");

async function firsttimequestions({ interaction }) {
  if (!interaction.id) return;
  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  var questions = temporarySetup.questions;
  const reviewChannel = temporarySetup.reviewchannel;
  const verifyChannel = temporarySetup.verifychannel;
  const verifiedRole = temporarySetup.verifiedrole;

  if (
    Array.isArray(questions) &&
    questions.every((q) => typeof q === "string")
  ) {
    try {
      questions = questions?.map((q) => JSON.parse(q));
    } catch (error) {
      console.error("Failed to parse questions:", error);
      questions = [];
    }
  }

  const questionembed = EmbedBuilder.from(interaction.message.embeds[0])
    .setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nGreat! You've set up all the required channels and the verified role! Now let's set up the questions. You need to have atleast a single question to finish the setup. Clicking "add question" will show you a prompt to add a question. **For multiple choice questions you use a new line (enter or return) for each option you want to add under the "multiple choice question" field.**\n\nOnce you've added all the questions you want, click the "Next" button below to see a summary and make adjustments or add options.`,
    )
    .setFields([
      {
        name: "Verification Channel `(required)`",
        value: `<#${verifyChannel}>`,
        inline: false,
      },
      {
        name: "Verification Review Channel `(required)`",
        value: `<#${reviewChannel}>`,
        inline: false,
      },
      {
        name: "Verified Role `(required)`",
        value: verifiedRole?.map((role) => `<@&${role}>`).join(", "),
        inline: false,
      },
      { name: "Questions", value: "_ _", inline: false },
    ]);

  const questionbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`addquestion_1`)
      .setLabel("Add Question")
      .setStyle("Primary"),
  );

  const finishbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("finishsetup_firsttime")
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup")
      .setLabel("Cancel")
      .setStyle("Danger"),
  );

  const editmenu = new ActionRowBuilder();

  if (questions && questions.length > 0) {
    questions = questions?.map((question) => {
      return question;
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("questionSelectMenu_1")
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

    if (interaction.replied || interaction.deferred) {
      interaction.message.edit({
        embeds: [questionembed],
        components: [editmenu, questionbuttons, finishbuttons],
      });
    } else {
      interaction.update({
        embeds: [questionembed],
        components: [editmenu, questionbuttons, finishbuttons],
      });
    }
  } else {
    if (interaction.replied || interaction.deferred) {
      interaction.message.edit({
        embeds: [questionembed],
        components: [questionbuttons, finishbuttons],
      });
    } else {
      interaction.update({
        embeds: [questionembed],
        components: [questionbuttons, finishbuttons],
      });
    }
  }
}

module.exports = firsttimequestions;

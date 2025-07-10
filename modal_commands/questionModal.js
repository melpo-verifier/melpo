const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { QuestionId } = require("../dbObjects.js");

module.exports = async ({ interaction, client, userid }) => {
  if (userid && userid.includes(" | ")) {
    await interaction.reply({
      content: `Oop! It seems this user has already been handled by someone else!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const replybutton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`question_${userid}`)
      .setLabel("Reply")
      .setStyle("Primary"),
  );

  const confirmrow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("answerquestion")
      .setLabel("Answer")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("opt-out")
      .setLabel("Opt-out")
      .setStyle("Danger"),
  );
  const question = interaction.fields.getTextInputValue("questionInput");
  const questionform = new EmbedBuilder()
    .setTitle(`Question from ${interaction.guild.name}`)
    .addFields({ name: "Question", value: question })
    .setColor("#3f7ff1")
    .setTimestamp()
    .setFooter({ text: `${interaction.guild.id}` });

  try {
    const user = await client.users.fetch(userid);
    const questionsend = await user.send({
      embeds: [questionform],
      components: [confirmrow],
    });
    await QuestionId.create({
      interactionMessageId: questionsend.id,
      question: interaction.fields.getTextInputValue("questionInput"),
      verificationMessageId: interaction.message.id,
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      userId: userid,
    });
  } catch (error) {
    if (error.code === 50007) {
      return await interaction.reply({
        content: `Cannot send question: this user has DMs disabled, has blocked the bot or left the server.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      throw error;
    }
  }

  const thread = interaction.message.thread;

  if (thread) {
    await thread.send({
      content: `${interaction.user.username} has sent the following to <@${userid}>: ${interaction.fields.getTextInputValue("questionInput")}`,
    });
    await interaction.reply({
      content: `Message sent succesfully! The answer will be sent in the thread linked to this message.`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: `${interaction.user.username} has sent the following to <@${userid}>: ${interaction.fields.getTextInputValue("questionInput")}`,
    });
  }

  if (interaction.message.embeds[0]?.footer?.text.startsWith(`DM | `)) {
    replybutton.components[0].setDisabled(true);
    interaction.message.edit({ components: [replybutton] });
  }
};

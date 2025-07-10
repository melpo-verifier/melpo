const { ButtonBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { QuestionId, OptOut } = require("../dbObjects.js");
// MAYBE EASIER TO CHANGE DATABASE TO A USER RELATED DATABASE, NOT MESSAGE ID RELATED DATABASE IN CASE IF THE USER LEAVES THE SERVER (USER -> GUILD1: {...}, gUILD2: {...})

module.exports = async ({ interaction }) => {
  const user = interaction.user;
  const info = await QuestionId.findOne({
    where: { interactionMessageId: interaction.message.id },
  });
  const guildId = info.guildId;
  const dmChannel = await user.createDM();

  var allinfo = await QuestionId.findAll({
    where: { userId: user.id, guildId: guildId },
  });

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

  await OptOut.destroy({
    where: {
      userId: user.id,
      guildId: guildId,
    },
  });

  allinfo = allinfo.filter(
    (item) => item.interactionMessageId !== info.interactionMessageId,
  );

  const message = await dmChannel.messages.fetch(info.interactionMessageId);
  const answerform = EmbedBuilder.from(message.embeds[0]).setColor("#3f7ff1");
  answerform.data.fields.splice(1, 1);
  await interaction.update({ components: [confirmrow], embeds: [answerform] });

  for (const info of allinfo) {
    const message = await dmChannel.messages.fetch(info.interactionMessageId);
    const answerform = EmbedBuilder.from(message.embeds[0]).setColor("#3f7ff1");

    answerform.data.fields.splice(1, 1);
    await message.edit({ components: [confirmrow], embeds: [answerform] });
  }
};

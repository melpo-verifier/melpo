const { ButtonBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { QuestionId, OptOut } = require("../dbObjects.js");
// MAYBE EASIER TO CHANGE DATABASE TO A USER RELATED DATABASE, NOT MESSAGE ID RELATED DATABASE IN CASE IF THE USER LEAVES THE SERVER (USER -> GUILD1: {...}, gUILD2: {...})

module.exports = async ({ interaction, client }) => {
  const user = interaction.user;
  const info = await QuestionId.findOne({
    where: { interactionMessageId: interaction.message.id },
  });
  const guildId = info.guildId;
  const guild = await client.guilds.fetch(guildId);
  const dmChannel = await user.createDM();

  var allinfo = await QuestionId.findAll({
    where: { userId: user.id, guildId: guildId },
  });

  const [optoutdb] = await OptOut.findOrCreate({
    where: { userId: user.id, guildId: guildId },
  });
  optoutdb.userId = user.id;
  optoutdb.optedOut = true;
  optoutdb.guildId = guildId;

  await optoutdb.save();

  const editbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("answerquestion")
      .setLabel("Answer")
      .setStyle("Success")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("opt-in")
      .setLabel("Opt-in")
      .setStyle("Primary"),
  );

  allinfo = allinfo.filter(
    (item) => item.interactionMessageId !== info.interactionMessageId,
  );

  const message = await dmChannel.messages.fetch(info.interactionMessageId);
  const answerform = EmbedBuilder.from(message.embeds[0])
    .addFields({
      name: "**OPTED OUT**",
      value: `You now cannot receive any questions from **${guild.name}**.\nYou can opt-in again to answer and receive questions from this server.`,
    })
    .setColor("#FF0000");
  await interaction.update({ components: [editbuttons], embeds: [answerform] });

  for (const info of allinfo) {
    const message = await dmChannel.messages.fetch(info.interactionMessageId);
    const answerform = EmbedBuilder.from(message.embeds[0])
      .addFields({
        name: "**OPTED OUT**",
        value: `You now cannot receive any questions from **${guild.name}**.\nYou can opt-in again to answer and receive questions from this server.`,
      })
      .setColor("#FF0000");

    await message.edit({ components: [editbuttons], embeds: [answerform] });
  }
};

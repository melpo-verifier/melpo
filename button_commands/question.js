const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { OptOut, ServerConfig } = require("../dbObjects.js");
module.exports = async ({ interaction, client, userid }) => {
  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  if (serverConfig && Array.isArray(serverConfig.managerrole)) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = serverConfig.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.reply({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${serverConfig.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const user = await client.users.fetch(userid);

  const optoutdb = await OptOut.findOne({
    where: { userId: userid, guildId: interaction.guild.id },
  });
  if (optoutdb !== null && optoutdb.optedOut === true) {
    return interaction.reply({
      content: `<@${userid}> has opted out of questions from this server. It thus is not possible to send them a question.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`questionModal_${userid}`)
    .setTitle(`Question ${user.tag}`);

  const questioninput = new TextInputBuilder()
    .setCustomId("questionInput")
    .setLabel(`What would you like to ask?`)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1020);

  const questionRow = new ActionRowBuilder().addComponents(questioninput);

  modal.addComponents(questionRow);

  await interaction.showModal(modal);
};

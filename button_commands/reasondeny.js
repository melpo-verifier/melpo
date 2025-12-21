const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { Application } = require("../dbObjects.js");

module.exports = async ({ interaction, client, userid, appName }) => {
  if (!userid) {
    throw new Error("Could not fetch user ID from the embed");
  }

  const application = await Application.findOne({
    where: { server_id: interaction.guild.id, name: appName },
  });

  if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = application.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.reply({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const user = await client.users.fetch(userid);

  const modal = new ModalBuilder()
    .setCustomId(`denyModal_${appName}`)
    .setTitle(`Deny ${user.tag}`);

  const denyinput = new TextInputBuilder()
    .setCustomId("denyInput")
    .setLabel(`Please provide a reason for denying this user`)
    .setStyle(TextInputStyle.Paragraph);

  const denyRow = new ActionRowBuilder().addComponents(denyinput);

  modal.addComponents(denyRow);

  await interaction.showModal(modal);
};

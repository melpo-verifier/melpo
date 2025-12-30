const {
  updateTempApplication,
  getTempApplicationById,
} = require("../js/tempconfigfuncs.js");
const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
  const selectedRole = parseInt(context[0], 10);
  const tempApplicationId = parseInt(context[1], 10);

  let whichdefault;

  const { error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: require("discord.js").MessageFlags.Ephemeral,
    });
  }

  const roles = interaction.values;

  if (selectedRole === 0) {
    whichdefault = 0;
    await updateTempApplication(interaction.guild.id,  { verifiedrole: roles }, { id: tempApplicationId });
  } else if (selectedRole === 1) {
    whichdefault = 1;
    await updateTempApplication(interaction.guild.id, { unverifiedrole: roles }, { id: tempApplicationId });
  } else if (selectedRole === 2) {
    whichdefault = 2;
    await updateTempApplication(interaction.guild.id, { pingrole: roles }, { id: tempApplicationId });
  } else if (selectedRole === 3) {
    whichdefault = 3;
    await updateTempApplication(interaction.guild.id, { managerrole: roles }, { id: tempApplicationId });
  } else if (selectedRole === 4) {
    whichdefault = 4;
    await updateTempApplication(interaction.guild.id, { autorole: roles }, { id: tempApplicationId });
  }

  await rolesinfo({ interaction, client, whichdefault, tempApplicationId });
};

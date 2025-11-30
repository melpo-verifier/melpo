const {
  createTempApplication,
  updateTempApplication,
} = require("../js/tempconfigfuncs.js");
const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
  const selectedRole = parseInt(context[0]);
  const appName = context[1];

  var whichdefault;

  await createTempApplication(interaction.guild.id, { name: appName });

  const roles = interaction.values;

  if (selectedRole === 0) {
    whichdefault = 0;
    await updateTempApplication(interaction.guild.id,  { verifiedrole: roles }, { name: appName });
  } else if (selectedRole === 1) {
    whichdefault = 1;
    await updateTempApplication(interaction.guild.id, { unverifiedrole: roles }, { name: appName });
  } else if (selectedRole === 2) {
    whichdefault = 2;
    await updateTempApplication(interaction.guild.id, { pingrole: roles }, { name: appName });
  } else if (selectedRole === 3) {
    whichdefault = 3;
    await updateTempApplication(interaction.guild.id, { managerrole: roles }, { name: appName });
  } else if (selectedRole === 4) {
    whichdefault = 4;
    await updateTempApplication(interaction.guild.id, { autorole: roles }, { name: appName });
  }

  await rolesinfo({ interaction, client, whichdefault, context: [appName] });
};

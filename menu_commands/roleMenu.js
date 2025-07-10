const {
  createTemporarySetup,
  updateTemporarySetup,
} = require("../js/tempconfigfuncs.js");
const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
  const selectedRole = parseInt(context);

  var whichdefault;

  await createTemporarySetup(interaction.guild.id);

  const roles = interaction.values;

  if (selectedRole === 0) {
    whichdefault = 0;
    await updateTemporarySetup(interaction.guild.id, { verifiedrole: roles });
  } else if (selectedRole === 1) {
    whichdefault = 1;
    await updateTemporarySetup(interaction.guild.id, { unverifiedrole: roles });
  } else if (selectedRole === 2) {
    whichdefault = 2;
    await updateTemporarySetup(interaction.guild.id, { pingrole: roles });
  } else if (selectedRole === 3) {
    whichdefault = 3;
    await updateTemporarySetup(interaction.guild.id, { managerrole: roles });
  } else if (selectedRole === 4) {
    whichdefault = 4;
    await updateTemporarySetup(interaction.guild.id, { autorole: roles });
  }

  await rolesinfo({ interaction, client, whichdefault });
};

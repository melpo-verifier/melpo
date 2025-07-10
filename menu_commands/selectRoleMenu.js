const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client }) => {
  const ivalue = interaction.values[0];

  var whichdefault;

  if (ivalue === "verifiedRole") {
    whichdefault = 0;
  } else if (ivalue === "unverifiedRole") {
    whichdefault = 1;
  } else if (ivalue === "pingRole") {
    whichdefault = 2;
  } else if (ivalue === "managerRole") {
    whichdefault = 3;
  } else if (ivalue === "autoRole") {
    whichdefault = 4;
  }

  await rolesinfo({ interaction, client, whichdefault });
};

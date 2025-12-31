const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
  const ivalue = interaction.values[0];
  const tempApplicationId = parseInt(context[0], 10);

  let whichdefault;

  if (ivalue === "verifiedRole") {
    whichdefault = 0;
  } else if (ivalue === "unverifiedRole") {
    whichdefault = 1;
  } else if (ivalue === "pingRole") {
    whichdefault = 2;
  } else if (ivalue === "managerRole") {
    whichdefault = 3;
  } else if (ivalue === "questionpingrole") {
    whichdefault = 4;
  }

  await rolesinfo({ interaction, client, whichdefault, tempApplicationId });
};

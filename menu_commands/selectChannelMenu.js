const generalinfo = require("../button_commands/setupbuttons/generalinfo.js");

module.exports = async ({ interaction, client, context }) => {
  const ivalue = interaction.values[0];

  var whichdefault;

  if (ivalue === "verifyChannel") {
    whichdefault = 0;
  } else if (ivalue === "reviewChannel") {
    whichdefault = 1;
  } else if (ivalue === "verifyLogsChannel") {
    whichdefault = 2;
  } else if (ivalue === "verificationWelcomeChannel") {
    whichdefault = 3;
  }

  await generalinfo({ interaction, client, whichdefault, context });
};

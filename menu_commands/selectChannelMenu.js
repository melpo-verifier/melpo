const generalinfo = require("../button_commands/setupbuttons/generalinfo.js");

module.exports = async ({ interaction, client, context }) => {
	const ivalue = interaction.values[0];
	const tempApplicationId = parseInt(context[0], 10);

	let whichdefault;

	switch (ivalue) {
		case "verifyChannel":
			whichdefault = 0;
			break;
		case "reviewChannel":
			whichdefault = 1;
			break;
		case "verifyLogsChannel":
			whichdefault = 2;
			break;
		case "verificationWelcomeChannel":
			whichdefault = 3;
			break;
	}

	await generalinfo({ interaction, client, whichdefault, tempApplicationId });
};

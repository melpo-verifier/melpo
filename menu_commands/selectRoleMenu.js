const rolesinfo = require("../button_commands/setupbuttons/rolesinfo.js");

module.exports = async ({ interaction, client, context }) => {
	const ivalue = interaction.values[0];
	const tempApplicationId = parseInt(context[0], 10);

	let whichdefault;

	switch (ivalue) {
		case "verifiedRole":
			whichdefault = 0;
			break;
		case "unverifiedRole":
			whichdefault = 1;
			break;
		case "pingRole":
			whichdefault = 2;
			break;
		case "managerRole":
			whichdefault = 3;
			break;
		case "questionpingrole":
			whichdefault = 4;
			break;
		case "deniedRole":
			whichdefault = 5;
			break;
		case "allowedroles":
			whichdefault = 6;
			break;
		case "ignoreroles":
			whichdefault = 7;
			break;
		case "pendingrole":
			whichdefault = 8;
			break;
		case "deniedremoveroles":
			whichdefault = 9;
			break;
	}

	await rolesinfo({ interaction, client, whichdefault, tempApplicationId });
};

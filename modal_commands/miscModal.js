const { MessageFlags } = require("discord.js");
const { getTempApplicationById, updateTempApplication } = require("../js/tempconfigfuncs.js");
const miscinfo = require("../button_commands/setupbuttons/miscinfo.js");

module.exports = async ({ interaction, context }) => {
	const tempApplicationId = parseInt(context[0], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: `Error: ${error || "Temporary application setup not found."}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	const kickOptions = interaction.fields.getCheckboxGroup?.("kickOptions") ?? [];
	const autoKickUnverifiedEnabled = kickOptions.includes("autoKickUnverifiedEnabled");
	const cancelKickOnSubmission = kickOptions.includes("cancelKickOnSubmission");

	const autoRemoveDeniedRoleEnabled = Boolean(interaction.fields.getCheckbox?.("autoRemoveDeniedRoleEnabled"));

	const rawKickHours = interaction.fields.getTextInputValue("autoKickUnverifiedHours").trim();
	const rawRemoveDeniedHours = interaction.fields.getTextInputValue("autoRemoveDeniedRoleHours").trim();
	const rawMaxDenials = interaction.fields.getTextInputValue("maxdenials").trim();

	const positiveIntRegex = /^[1-9]\d*$/;

	if (!positiveIntRegex.test(rawKickHours)) {
		return interaction.reply({
			content: "Invalid input for **Auto-Kick Hours**: please enter a positive number (e.g., `48`).",
			flags: MessageFlags.Ephemeral,
		});
	}

	if (!positiveIntRegex.test(rawRemoveDeniedHours)) {
		return interaction.reply({
			content: "Invalid input for **Remove Denied Role Hours**: please enter a positive number (e.g., `24`).",
			flags: MessageFlags.Ephemeral,
		});
	}

	let parsedMaxDenials = null;
	if (rawMaxDenials !== "" && rawMaxDenials !== "0") {
		if (!positiveIntRegex.test(rawMaxDenials)) {
			return interaction.reply({
				content: "Invalid input for **Max Denials**: please enter a positive number.",
				flags: MessageFlags.Ephemeral,
			});
		}
		parsedMaxDenials = parseInt(rawMaxDenials, 10);
	}

	const parsedKickHours = parseInt(rawKickHours, 10);
	const parsedRemoveDeniedHours = parseInt(rawRemoveDeniedHours, 10);

	await updateTempApplication(
		interaction.guild.id,
		{
			autoKickUnverifiedEnabled,
			cancelKickOnSubmission,
			autoKickUnverifiedHours: parsedKickHours,
			autoRemoveDeniedRoleEnabled,
			autoRemoveDeniedRoleHours: parsedRemoveDeniedHours,
			maxdenials: parsedMaxDenials,
		},
		{ id: tempApplicationId },
	);

	await miscinfo({ interaction, tempApplicationId });
};

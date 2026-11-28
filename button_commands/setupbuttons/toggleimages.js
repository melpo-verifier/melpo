const { MessageFlags } = require("discord.js");
const { updateTempApplication, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const questioninfo = require("./questioninfo.js");

module.exports = async ({ interaction, context }) => {
	const imageSubmission = context[0] === "true";
	const tempApplicationId = parseInt(context[1], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error) {
		return interaction.reply({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	if (!tempApp) throw new Error("Failed to fetch temporary setup.");

	const newImageSubmission = !imageSubmission;

	await updateTempApplication(interaction.guild.id, { imageSubmission: newImageSubmission }, { id: tempApplicationId });
	await questioninfo({ interaction, tempApplicationId });
};

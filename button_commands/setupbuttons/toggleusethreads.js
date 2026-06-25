const { updateTempApplication, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const miscinfo = require("./miscinfo.js");

module.exports = async ({ interaction, context }) => {
	const threadenabled = context[0] === "true";
	const tempApplicationId = parseInt(context[1], 10);

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error) {
		return interaction.reply({
			content: `Error: ${error}`,
			flags: require("discord.js").MessageFlags.Ephemeral,
		});
	}

	console.log(`Toggling useThreads for guild ${interaction.guild.id}. Current value: ${threadenabled}`);
	if (!tempApp) throw new Error("Failed to fetch temporary setup.");

	const newUseThreads = !threadenabled;
	console.log(`New useThreads value for guild ${interaction.guild.id}: ${newUseThreads}`);

	await updateTempApplication(interaction.guild.id, { usethreads: newUseThreads }, { id: tempApplicationId });
	await miscinfo({ interaction, tempApplicationId });
};

const { EmbedBuilder } = require("discord.js");
const { Application } = require("../../dbObjects.js");
const { deleteTempApplication } = require("../../js/tempconfigfuncs.js");
const { deleteImage, getImageKey, purgeOldImages } = require("../../js/customizationImages.js");

function collectR2Keys(fieldData) {
	if (!fieldData) return [];

	const keys = [];
	const stack = [fieldData];

	while (stack.length > 0) {
		const node = stack.pop();
		if (!node) continue;

		const imageKey = getImageKey(node.image);
		const thumbKey = getImageKey(node.accessory?.image);
		if (imageKey) keys.push(imageKey);
		if (thumbKey) keys.push(thumbKey);

		if (Array.isArray(node.blocks)) {
			stack.push(...node.blocks);
		}
	}

	return keys;
}

module.exports = async ({ interaction, context }) => {
	await interaction.deferUpdate();

	const applicationId = parseInt(context[0], 10);
	const application = await Application.findOne({ where: { id: applicationId, server_id: interaction.guild.id } });
	if (!application) return interaction.followUp({ content: "Application not found or already deleted." });

	const appName = application.name;

	// Clean up images
	const imageFields = [
		"verifychannelembed",
		"startmessage",
		"finishmessage",
		"verifymessage",
		"denymessage",
		"kickmessage",
		"verificationwelcomemessage",
	];

	for (const field of imageFields) {
		const fieldData = application[field];
		const keys = collectR2Keys(fieldData);
		if (keys.length > 0 || fieldData?.image || Array.isArray(fieldData?.blocks)) {
			try {
				for (const key of keys) {
					await deleteImage(key);
				}
				await purgeOldImages({
					serverId: interaction.guild.id,
					appName,
					section: field,
					keepKey: null,
				});
			} catch (error) {
				console.error(`Failed to delete image for ${field}:`, error);
			}
		}
	}

	await deleteTempApplication(interaction.guild.id, { applicationId });

	await application.destroy();

	const successEmbed = new EmbedBuilder()
		.setColor("#00ff00")
		.setTitle("Application Deleted")
		.setDescription(`The application "${appName}" has been successfully deleted.`);

	await interaction.editReply({ embeds: [successEmbed], components: [] });
};

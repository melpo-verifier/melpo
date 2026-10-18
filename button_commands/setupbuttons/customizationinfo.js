const { ButtonBuilder, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const { getApplicationById, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, applicationId, tempApplicationId }) => {
	tempApplicationId = tempApplicationId ?? applicationId ?? (context?.[0] ? parseInt(context[0], 10) : null);

	if (!tempApplicationId) {
		return interaction.reply({
			content: "Temp Application ID is missing. Please try again.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error) {
		return interaction.reply({
			content: `Error: ${error}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	let applicationSetup = null;
	if (tempApp.applicationId) {
		const { application } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
		applicationSetup = application;
	}

	const messageFields = [
		{
			key: "verifychannelembed",
			label: "Application Panel",
			description: "Message with which users start the application process",
		},
		{
			key: "startmessage",
			label: "Application Start",
			description: "Message user gets when starting an application",
		},
		{
			key: "finishmessage",
			label: "Submission Confirmation",
			description: "Message user gets when submitting an application",
		},
		{
			key: "verifymessage",
			label: "Acceptance Notice",
			description: "Message user gets when getting accepted",
		},
		{
			key: "denymessage",
			label: "Denial Notice",
			description: "Message user gets when getting denied",
		},
		{
			key: "verificationwelcomemessage",
			label: "Welcome Message",
			description: "Welcome message in the server when user gets accepted",
		},
	];

	const statusLines = messageFields.map((field) => {
		const messageConfig =
			tempApp[field.key] && Object.keys(tempApp[field.key]).length > 0
				? tempApp[field.key]
				: applicationSetup?.[field.key];
		const isV2 = messageConfig?.format === "v2" || Array.isArray(messageConfig?.blocks);
		return `- **${field.label}** — ${isV2 ? "`Components V2 (Web Dashboard)`" : "`Embed`"}`;
	});

	//Note : Static invite token.
	const customizationEmbed = new EmbedBuilder()
		.setColor("#3f7ff1")
		.setTitle("Customization setup")
		.setDescription(
			`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nYou can customize all messages that the bot sends. Please note that the welcome message only has effect when a welcome channel is set up in the "Channels" section.
> 💡 **Tip:** For easier editing, or premium Drag & Drop Modern Card Layout (components V2), check out the **[Web Dashboard](https://melpo.app/dashboard/${interaction.guild.id})**.
\n**Customizable Messages:**\n${statusLines.join("\n")}`,
		);

	const finishbuttons = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`finishsetup_${tempApplicationId}`).setLabel("Finish Setup").setStyle("Success"),
		new ButtonBuilder().setCustomId(`cancelsetup_${tempApplicationId}`).setLabel("Cancel").setStyle("Danger"),
		new ButtonBuilder()
			.setLabel("Configure on dashboard")
			.setStyle("Link")
			.setURL(`https://melpo.app/dashboard/${interaction.guild.id}`),
	);

	const selectcustomizationMenu = new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(`selectcustomizationMenu_${tempApplicationId}`)
			.setPlaceholder("Select what message you want to customize")
			.addOptions(
				messageFields.map((field) => ({
					label: field.label,
					description: field.description,
					value: field.key,
				})),
			),
	);

	const categoryButtons = createCategoryButtons(tempApplicationId, 3); // 3 = Customization is disabled

	if (interaction.replied || interaction.deferred) {
		await interaction.message.edit({
			content: "",
			embeds: [customizationEmbed],
			components: [categoryButtons, selectcustomizationMenu, finishbuttons],
		});
	} else {
		await interaction.update({
			content: "",
			embeds: [customizationEmbed],
			components: [categoryButtons, selectcustomizationMenu, finishbuttons],
		});
	}
};

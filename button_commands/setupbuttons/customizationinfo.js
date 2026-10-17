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
			label: "Verify channel Embed",
			description: 'Message to which users click "verify" to start verification',
		},
		{
			key: "startmessage",
			label: "Verification start message",
			description: "Message user gets when starting verification",
		},
		{
			key: "finishmessage",
			label: "Verification finish message",
			description: "Message user gets when finishing verification",
		},
		{
			key: "verifymessage",
			label: "On verify message",
			description: "Message user gets when getting verified",
		},
		{
			key: "denymessage",
			label: "On deny message",
			description: "Message user gets when getting denied",
		},
		{
			key: "verificationwelcomemessage",
			label: "Verification welcome message",
			description: "Welcome message in the server when user gets verified",
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
			`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nYou can customize all messages that the bot sends. Please note that the verification welcome message only has effect when a verification welcome channel is set up in the "Channels" section.
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

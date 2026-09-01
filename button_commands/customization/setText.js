const {
	ActionRowBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ButtonBuilder,
	ComponentType,
} = require("discord.js");
const activeCollectors = new Map();
const { updateTempApplication, getTempApplicationById } = require("../../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
	const customIdValue = context[0];
	const tempApplicationId = parseInt(context[1], 10);

	// Validate tempApplicationId
	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: error || "Application not found or does not belong to this server.",
			flags: 64,
		});
	}

	if (customIdValue === "verificationwelcomemessage") {
		await messageCollecting(interaction, customIdValue, tempApplicationId);
	} else {
		const modal = new ModalBuilder()
			.setCustomId(`setTextModal_${customIdValue}_${tempApplicationId}`)
			.setTitle("Edit Embed Text");

		// Get existing values or set defaults
		const existingEmbed = interaction.message.embeds[1];
		const existingTitle = existingEmbed?.title || "";
		const existingDescription = existingEmbed?.description || interaction.message.content || "";

		const Title = new TextInputBuilder()
			.setCustomId(`title`)
			.setLabel("Set Embed Title (optional)")
			.setStyle(TextInputStyle.Short)
			.setPlaceholder("Title of the embed (optional)")
			.setRequired(false)
			.setMaxLength(256)
			.setValue(existingTitle);

		const Description = new TextInputBuilder()
			.setCustomId(`description`)
			.setLabel("Set Embed Description")
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder("Enter embed description here")
			.setRequired(true)
			.setValue(existingDescription);

		const titleRow = new ActionRowBuilder().addComponents(Title);
		const descriptionRow = new ActionRowBuilder().addComponents(Description);
		modal.addComponents(titleRow, descriptionRow);

		await interaction.showModal(modal);
	}
};

async function messageCollecting(interaction, customIdValue, tempApplicationId) {
	const channelId = interaction.channel.id;
	const userId = interaction.user.id;

	// Check if a collector is already active in the channel
	if (activeCollectors.has(channelId)) {
		const existingCollector = activeCollectors.get(channelId);
		existingCollector.stop("newCollectorStarted");
	}

	const filter = (msg) => msg.author.id === userId;

	const buttonfilter = (buttonInteraction) =>
		buttonInteraction.user.id === interaction.user.id &&
		(buttonInteraction.customId.startsWith("cancelsetText") || buttonInteraction.customId.startsWith("notitle")) &&
		(buttonInteraction.message.content.includes("Please note you cannot use {mentionuser} in the title.") ||
			buttonInteraction.message.content.includes("Now, please provide the description for the welcome message."));

	const messageCollector = interaction.channel.createMessageCollector({
		filter,
		time: 5 * 60000,
	});

	const cancelCollector = interaction.channel.createMessageComponentCollector({
		filter: buttonfilter,
		componentType: ComponentType.Button,
		time: 5 * 60000,
		max: 2,
		dispose: true,
	});

	// Store the collector in the Map
	activeCollectors.set(channelId, messageCollector);

	let step = 0;
	const botMessages = [];

	const cancelrow = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("cancelsetText").setLabel("Cancel").setStyle("Danger"),
	);

	const disabledcancelrow = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("cancelsetText").setLabel("Cancel").setStyle("Danger").setDisabled(true),
	);

	const titelcancelrow = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("cancelsetText").setLabel("Cancel").setStyle("Danger"),
		new ButtonBuilder().setCustomId("notitle").setLabel("No Title").setStyle("Primary"),
	);

	const disabledtitelcancelrow = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId("cancelsetText").setLabel("Cancel").setStyle("Danger").setDisabled(true),
		new ButtonBuilder().setCustomId("notitle").setLabel("No Title").setStyle("Primary").setDisabled(true),
	);

	const sendMessage = async (type, content, cancel) => {
		let message;

		if (type === "interactionreply") {
			if (cancel) {
				message = await interaction.reply({
					content: content,
					components: [titelcancelrow],
				});
			} else {
				message = await interaction.reply(content);
			}
		} else if (type === "send") {
			message = await interaction.channel.send(content);
		} else if (type === "messagereply") {
			if (cancel) {
				message = await interaction.message.reply({
					content: content,
					components: [cancelrow],
				});
			} else {
				message = await interaction.message.reply({ content: content });
			}
		}

		botMessages.push(message);
	};

	//NEEDS FIXING WITH THE EMPTY TITLE!!!!
	await sendMessage(
		"interactionreply",
		`You'll be able to change the title and the description of the welcome message, we'll start with the title you would like to set. You have 5 minutes to do so.\n**Please note you cannot use {mentionuser} in the title.**`,
		true,
	);

	let title;
	let description;

	cancelCollector.on("collect", async (buttonInteraction) => {
		if (buttonInteraction.customId === "cancelsetText") {
			messageCollector.stop("cancelled");
			buttonInteraction.update({
				content: "Cancelled the setup of the welcome message.",
				components: [],
			});
		} else if (buttonInteraction.customId === "notitle") {
			buttonInteraction.update({ components: [disabledtitelcancelrow] });
			title = "deleted";
			step++;
			await sendMessage("messagereply", "Now, please provide the description for the welcome message.", true);
		}
	});

	messageCollector.on("collect", async (collected) => {
		const currentEmbed = interaction.message.embeds?.find((embed) => embed.footer?.text?.includes(customIdValue));

		if (!currentEmbed && !interaction.message.content) {
			messageCollector.stop("cancelled");
			return sendMessage(
				"messagereply",
				"The setup process was canceled because the page has changed. Please restart the setup if needed.",
			);
		}

		if (step === 0) {
			if (collected.content.length > 256) {
				return sendMessage(
					"messagereply",
					"Custom welcome message has been cancelled: The title exceeds the 256 character limit. Please provide a shorter title.",
				);
			}

			title = collected.content;

			await botMessages[botMessages.length - 1].edit({ components: [disabledtitelcancelrow] });

			await sendMessage("messagereply", "Now, please provide the description for the welcome message.", true);

			step++;
		} else if (step === 1) {
			if (collected.content.length > 4096) {
				return sendMessage(
					"messagereply",
					"Custom welcome message has been cancelled: The description exceeds the 4096 character limit. Please provide a shorter description.",
				);
			}
			await botMessages[botMessages.length - 1].edit({ components: [disabledcancelrow] });
			description = collected.content;
			step++;
			messageCollector.stop("finished");
		}
	});

	messageCollector.on("end", async (collected, reason) => {
		cancelCollector.stop("cancelled");
		// Clean up the collector from the Map
		activeCollectors.delete(channelId);
		if (reason === "finished") {
			await updateTempApplication(
				interaction.guild.id,
				{
					[customIdValue]: {
						title: title,
						description: description,
						text: "deleted",
					},
				},
				{ id: tempApplicationId },
			);
			const endmessage = await interaction.message.reply({
				content: "Verification welcome message succesfully set! Now returning to the setup embed...",
			});

			setTimeout(async () => {
				endmessage.delete();
				// Delete collected messages
				for (const message of collected.values()) {
					await message.delete().catch(console.error);
				}

				// Delete bot messages
				for (const message of botMessages) {
					await message.delete().catch(console.error);
				}

				//delete botMessages
				botMessages.length = 0;

				const customizationMenu = require("../../menu_commands/selectcustomizationMenu.js");
				customizationMenu({ interaction, customIdValue, tempApplicationId });
			}, 2500);
		} else if (reason === "cancelled") {
			setTimeout(async () => {
				// Delete collected messages
				for (const message of collected.values()) {
					await message.delete().catch(console.error);
				}

				// Delete bot messages
				for (const message of botMessages) {
					await message.delete().catch(console.error);
				}

				botMessages.length = 0;
			}, 2500);
		} else {
			botMessages.length = 0;
		}
	});
}

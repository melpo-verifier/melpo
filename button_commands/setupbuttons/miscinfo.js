const {
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	MessageFlags,
	LabelBuilder,
	CheckboxBuilder,
	CheckboxGroupBuilder,
} = require("discord.js");
const { getApplicationById, getTempApplicationById, updateTempApplication } = require("../../js/tempconfigfuncs.js");
const { isPremiumServer } = require("../../js/DBFunctions.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, applicationId, tempApplicationId }) => {
	tempApplicationId =
		tempApplicationId ?? applicationId ?? (parseInt(context?.[0], 10) || null) ?? (parseInt(context?.[1], 10) || null);

	if (!tempApplicationId) {
		return interaction.reply({
			content: "Temp Application ID is missing. Please try again.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (error || !tempApp) {
		return interaction.reply({
			content: `Error: ${error || "Temp application not found"}`,
			flags: MessageFlags.Ephemeral,
		});
	}

	let applicationSetup = null;
	if (tempApp.applicationId) {
		const { application } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
		applicationSetup = application;
	}

	let autoKickUnverifiedEnabled =
		tempApp.autoKickUnverifiedEnabled !== null && tempApp.autoKickUnverifiedEnabled !== undefined
			? tempApp.autoKickUnverifiedEnabled
			: (applicationSetup?.autoKickUnverifiedEnabled ?? false);

	const autoKickUnverifiedHours =
		tempApp.autoKickUnverifiedHours !== null && tempApp.autoKickUnverifiedHours !== undefined
			? tempApp.autoKickUnverifiedHours
			: (applicationSetup?.autoKickUnverifiedHours ?? 48);

	let cancelKickOnSubmission =
		tempApp.cancelKickOnSubmission !== null && tempApp.cancelKickOnSubmission !== undefined
			? tempApp.cancelKickOnSubmission
			: (applicationSetup?.cancelKickOnSubmission ?? true);

	let autoRemoveDeniedRoleEnabled =
		tempApp.autoRemoveDeniedRoleEnabled !== null && tempApp.autoRemoveDeniedRoleEnabled !== undefined
			? tempApp.autoRemoveDeniedRoleEnabled
			: (applicationSetup?.autoRemoveDeniedRoleEnabled ?? false);

	const autoRemoveDeniedRoleHours =
		tempApp.autoRemoveDeniedRoleHours !== null && tempApp.autoRemoveDeniedRoleHours !== undefined
			? tempApp.autoRemoveDeniedRoleHours
			: (applicationSetup?.autoRemoveDeniedRoleHours ?? 24);

	let maxdenials = tempApp.maxdenials !== undefined ? tempApp.maxdenials : (applicationSetup?.maxdenials ?? null);

	const action = context?.[1];
	if (action === "modal") {
		const modal = new ModalBuilder()
			.setCustomId(`miscModal_${tempApplicationId}`)
			.setTitle("Configure Automation & Timers");

		const kickToggle = new LabelBuilder().setLabel("Auto-Kick Settings").setCheckboxGroupComponent(
			new CheckboxGroupBuilder()
				.setCustomId("kickOptions")
				.setRequired(false)
				.setMinValues(0)
				.setMaxValues(2)
				.addOptions([
					{
						label: "Enable Auto-Kick",
						value: "autoKickUnverifiedEnabled",
						description: "Kick members if they fail to apply in time",
						default: Boolean(autoKickUnverifiedEnabled),
					},
					{
						label: "Cancel Kick on Submission",
						value: "cancelKickOnSubmission",
						description: "Stops the kick timer while waiting for staff review",
						default: Boolean(cancelKickOnSubmission),
					},
				]),
		);

		const kickHours = new LabelBuilder()
			.setLabel("Auto-Kick Hours")
			.setDescription("Duration in hours before an unaccepted member is kicked")
			.setTextInputComponent(
				new TextInputBuilder()
					.setCustomId("autoKickUnverifiedHours")
					.setStyle(TextInputStyle.Short)
					.setPlaceholder("e.g. 48")
					.setRequired(true)
					.setMaxLength(6)
					.setValue(String(autoKickUnverifiedHours ?? 48)),
			);

		const removeDeniedToggle = new LabelBuilder()
			.setLabel("Enable Auto-Remove Denied Role")
			.setDescription("Automatically clear the denied role after a timeout")
			.setCheckboxComponent(
				new CheckboxBuilder()
					.setCustomId("autoRemoveDeniedRoleEnabled")
					.setDefault(Boolean(autoRemoveDeniedRoleEnabled)),
			);

		const removeDeniedHours = new LabelBuilder().setLabel("Remove Denied Role Hours").setTextInputComponent(
			new TextInputBuilder()
				.setCustomId("autoRemoveDeniedRoleHours")
				.setStyle(TextInputStyle.Short)
				.setPlaceholder("e.g. 24")
				.setRequired(true)
				.setMaxLength(6)
				.setValue(String(autoRemoveDeniedRoleHours ?? 24)),
		);

		const maxDenials = new LabelBuilder()
			.setLabel("Max Denials")
			.setDescription("Maximum times a user can be denied before being assigned the Denied Role. (1 is default)")
			.setTextInputComponent(
				new TextInputBuilder()
					.setCustomId("maxdenials")
					.setStyle(TextInputStyle.Short)
					.setPlaceholder("e.g. 3")
					.setRequired(false)
					.setMaxLength(4)
					.setValue(maxdenials !== null && maxdenials !== undefined ? String(maxdenials) : ""),
			);

		modal.addLabelComponents(kickHours, kickToggle, removeDeniedHours, removeDeniedToggle, maxDenials);

		return await interaction.showModal(modal);
	}

	if (action === "togglekick") {
		autoKickUnverifiedEnabled = !autoKickUnverifiedEnabled;
		await updateTempApplication(interaction.guild.id, { autoKickUnverifiedEnabled }, { id: tempApplicationId });
	} else if (action === "toggledeny") {
		autoRemoveDeniedRoleEnabled = !autoRemoveDeniedRoleEnabled;
		await updateTempApplication(interaction.guild.id, { autoRemoveDeniedRoleEnabled }, { id: tempApplicationId });
	}

	/** biome-ignore format : Removal of brackets here makes code less readable */
	const useThreads = 
		(tempApp.usethreads !== null && tempApp.usethreads !== undefined)
			? tempApp.usethreads
			: (applicationSetup?.usethreads ?? false);

	const isPremium = await isPremiumServer(interaction.guild.id);

	//if not premium disable all premium features, without actually disabling them in database.
	if (!isPremium) {
		autoKickUnverifiedEnabled = false;
		autoRemoveDeniedRoleEnabled = false;
		cancelKickOnSubmission = false;
		maxdenials = null;
	}

	//Note : Static invite token.
	const miscEmbed = new EmbedBuilder()
		.setColor("#3f7ff1")
		.setTitle("Threads & Automations setup")
		.setDescription(
			`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nMiscellaneous and automation options that can be set up:${!isPremium ? "\n-# ✨ *Automation timers & max denials are **Premium** features. Check out everything you can with premium [right here](https://melpo.app/docs/advanced-features)!*" : ""}`,
		)
		.addFields(
			{
				name: `Use Threads`,
				value: `${useThreads ? "🟢 `Enabled`" : "🔴 `Disabled`"}\n*When enabled, attaches a thread to applications for organised review and discussion. Answers to questions are sent directly to the thread. **Recommended if you have a log channel setup and/or receive many applications.***`,
				inline: false,
			},
			{
				name: "Auto-Kick Unaccepted Members `✨ Premium`",
				value: `**${autoKickUnverifiedEnabled ? `🟢 \`Enabled\` — \`${autoKickUnverifiedHours} hour(s)\`` : "🔴 `Disabled`"}**\n*Automatically kicks unaccepted users if they do not apply within the configured time window.*
				**Cancel Kick on Submission**\n**${cancelKickOnSubmission ? "🟢 `Enabled`" : "🔴 `Disabled`"}**\n***Enabled:** Cancels the auto-kick timer on application submission.\n**Disabled:** Kicks the user regardless of application status.*`,
				inline: false,
			},
			{
				name: "Auto-Remove Denied Role `✨ Premium`",
				value: `**${autoRemoveDeniedRoleEnabled ? `🟢 \`Enabled\` — \`${autoRemoveDeniedRoleHours} hour(s)\`` : "🔴 `Disabled`"}**\n*Automatically removes the assigned Denied Role after the configured cooldown hours.*`,
				inline: false,
			},
			{
				name: "Max Denials `✨ Premium`",
				value: `**${maxdenials ? `${maxdenials} denial(s)` : "1 denial (default)"}**\n*Maximum times a user can be denied before being assigned the Denied Role.*`,
				inline: false,
			},
		);

	const finishbuttons = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`finishsetup_${tempApplicationId}`).setLabel("Finish Setup").setStyle("Success"),
		new ButtonBuilder().setCustomId(`cancelsetup_${tempApplicationId}`).setLabel("Cancel").setStyle("Danger"),
		new ButtonBuilder()
			.setLabel("Configure on dashboard")
			.setStyle("Link")
			.setURL(`https://melpo.app/dashboard/${interaction.guild.id}`),
	);

	const miscButtons = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`toggleusethreads_${useThreads}_${tempApplicationId}`)
			.setLabel(`${useThreads ? "Disable" : "Enable"} Threads`)
			.setStyle(useThreads ? "Danger" : "Success"),
		new ButtonBuilder()
			.setCustomId(`miscinfo_${tempApplicationId}_modal`)
			.setLabel("Edit Timers & Max Denials")
			.setStyle("Primary")
			.setDisabled(!isPremium),
		// new ButtonBuilder()
		// 	.setCustomId(`miscinfo_${tempApplicationId}_togglekick`)
		// 	.setLabel(`${autoKickUnverifiedEnabled ? "Disable" : "Enable"} Auto-Kick`)
		// 	.setStyle(autoKickUnverifiedEnabled ? "Danger" : "Success"),
		// new ButtonBuilder()
		// 	.setCustomId(`miscinfo_${tempApplicationId}_toggledeny`)
		// 	.setLabel(`${autoRemoveDeniedRoleEnabled ? "Disable" : "Enable"} Denied Role Timer`)
		// 	.setStyle(autoRemoveDeniedRoleEnabled ? "Danger" : "Success"),
	);

	const categoryButtons = createCategoryButtons(tempApplicationId, 4); // 4 = Misc is disabled

	if (interaction.replied || interaction.deferred) {
		await interaction.message.edit({
			content: "",
			embeds: [miscEmbed],
			components: [categoryButtons, miscButtons, finishbuttons],
		});
	} else {
		await interaction.update({
			content: "",
			embeds: [miscEmbed],
			components: [categoryButtons, miscButtons, finishbuttons],
		});
	}
};

const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder } = require("discord.js");
const { Application } = require("../../dbObjects.js");
const { deleteTempApplication, getApplicationById, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const { promoteCustomizationImage, purgeOldImages, isR2ImageResource } = require("../../js/customizationImages.js");
const { syncApplicationPanels } = require("../../js/updatePanels.js");

module.exports = async ({ interaction, client, context }) => {
	const tempApplicationId = context[0] === "firsttime" ? parseInt(context[1], 10) : parseInt(context[0], 10);

	const { tempApp, error: tempAppError } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
	if (tempAppError || !tempApp) {
		return interaction.reply({
			content:
				"Temp setup not found. This can happen if you already had a different setup in progress and finished that. Please click cancel and use `/setup` again.",
			flags: MessageFlags.Ephemeral,
		});
	}

	// Check if editing an existing application or creating a new one
	let existingApp = null;
	const isEditMode = !!tempApp.applicationId;

	if (isEditMode) {
		const { application, error } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
		if (error) return interaction.reply({ content: `Error: ${error}`, flags: MessageFlags.Ephemeral });

		existingApp = application;
	}

	const questions = tempApp.questions;
	const reviewChannel = tempApp.reviewchannel;
	const verifyChannel = tempApp.verifychannel;
	const verifiedRole = tempApp.verifiedrole;

	if (!(verifyChannel?.length > 0 && reviewChannel?.length > 0 && verifiedRole?.length > 0 && questions?.length > 0)) {
		return interaction.reply({
			content: "You need to set up all the *required* channels, roles and questions before finishing the setup.",
			flags: MessageFlags.Ephemeral,
		});
	}

	if (questions.length === 0) {
		return interaction.reply({ content: "You need to add at least one question.", flags: MessageFlags.Ephemeral });
	}

	const verifyChannelObj = interaction.guild.channels.cache.get(verifyChannel);
	if (!verifyChannelObj) {
		return interaction.reply({
			content: "The user verification channel has been deleted. Please set up the user verification channel again.",
			flags: MessageFlags.Ephemeral,
		});
	}

	await interaction.deferUpdate();

	const verifychannelembed = tempApp.verifychannelembed || {};
	const startmessage = tempApp.startmessage || {};
	const finishmessage = tempApp.finishmessage || {};
	const verifymessage = tempApp.verifymessage || {};
	const denymessage = tempApp.denymessage || {};
	const verificationwelcomemessage = tempApp.verificationwelcomemessage || {};

	await finalizeCustomizationImage(tempApp, "verifychannelembed", "images/verifychannelembed", interaction.guild.id);
	await finalizeCustomizationImage(tempApp, "startmessage", "images/startmessage", interaction.guild.id);
	await finalizeCustomizationImage(tempApp, "finishmessage", "images/finishmessage", interaction.guild.id);
	await finalizeCustomizationImage(tempApp, "verifymessage", "images/verifymessage", interaction.guild.id);
	await finalizeCustomizationImage(tempApp, "denymessage", "images/denymessage", interaction.guild.id);
	await finalizeCustomizationImage(
		tempApp,
		"verificationwelcomemessage",
		"images/verificationwelcomemessage",
		interaction.guild.id,
	);

	cleanConfig(verifychannelembed);
	cleanConfig(startmessage);
	cleanConfig(finishmessage);
	cleanConfig(verifymessage);
	cleanConfig(denymessage);
	cleanConfig(verificationwelcomemessage);

	const imageCategories = [
		"verifychannelembed",
		"startmessage",
		"finishmessage",
		"verifymessage",
		"denymessage",
		"verificationwelcomemessage",
	];

	for (const category of imageCategories) {
		if (tempApp[category]?.image === "deleted") {
			continue;
		}

		if (isR2ImageResource(tempApp[category]?.image)) continue;
	}

	const appData = {
		server_id: interaction.guild.id,
		name: tempApp.name,
		maxdenials: tempApp.maxdenials ?? null,
	};
	const fields = [
		"questions",
		"reviewchannel",
		"verifylogs",
		"verifychannel",
		"verifiedrole",
		"deniedrole",
		"verifychannelembed",
		"startmessage",
		"finishmessage",
		"verifymessage",
		"denymessage",
		"verificationwelcomemessage",
		"questionpingrole",
		"unverifiedrole",
		"pingrole",
		"managerrole",
		"verificationwelcomechannel",
		"usethreads",
		"verifymessage_id",
		"autoRemoveDeniedRoleEnabled",
		"autoRemoveDeniedRoleHours",
		"autoKickUnverifiedEnabled",
		"cancelKickOnSubmission",
		"autoKickUnverifiedHours",
	];

	const jsonbFields = [
		"questions",
		"verifiedrole",
		"deniedrole",
		"questionpingrole",
		"unverifiedrole",
		"pingrole",
		"managerrole",
		"verifychannelembed",
		"startmessage",
		"finishmessage",
		"verifymessage",
		"denymessage",
		"verificationwelcomemessage",
	];

	for (const field of fields) {
		const value = tempApp[field];
		if (value == null) continue; // Skip null/undefined values

		if (Array.isArray(value)) {
			// Include empty arrays (to allow clearing roles)
			appData[field] = value;
		} else if (typeof value === "object") {
			// Skip empty objects, include non-empty objects
			if (Object.keys(value).length > 0) {
				appData[field] = value;
			}
		} else if (value !== "") {
			// Include all other non-null/non-empty values
			appData[field] = value;
		}
	}

	// Create new or update existing application
	let finalApp;
	if (isEditMode) {
		// Update
		Object.assign(existingApp, appData);
		for (const field of jsonbFields) {
			if (field in appData) existingApp.changed(field, true);
		}
		await existingApp.save();
		finalApp = existingApp;
	} else {
		// Check if application exists (in case of error)
		const appExists = await Application.findOne({ where: { server_id: interaction.guild.id, name: tempApp.name } });
		if (appExists) {
			Object.assign(appExists, appData);
			for (const field of jsonbFields) {
				if (field in appData) appExists.changed(field, true);
			}
			await appExists.save();
			finalApp = appExists;
		} else {
			finalApp = await Application.create(appData);
		}
	}

	const guild = client.guilds.cache.get(interaction.guild.id);

	//update verify panel for all applications.
	const result = await syncApplicationPanels(guild, client.user.id, []);

	if (result?.messageId && result.messageId !== finalApp.verifymessage_id) {
		finalApp.verifymessage_id = result.messageId;
		await finalApp.save().catch((e) => console.error("Error saving verify message ID", e));
	}

	await deleteTempApplication(interaction.guild.id, { id: tempApplicationId });

	if (interaction.customId.includes("firsttime")) {
		const formattedVerifiedRoles = verifiedRole?.length
			? verifiedRole.map((roleId) => `<@&${roleId}>`).join(", ")
			: "None";

		const launchpadEmbed = new EmbedBuilder()
			.setColor("#3f7ff1")
			.setTitle(`${finalApp.name} is ready to use!`)
			.setDescription(
				`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nYour Application start panel has been deployed to <#${verifyChannelObj.id}>! Users can now apply and your staff can review submissions in <#${reviewChannel}>. Try it yourself to see how it works! Thank you for using Melpo ^^`,
			)
			.addFields(
				{
					name: "✅ Configured",
					value: `- **Application:** \`${finalApp.name}\`\n- **Application Start Channel:** <#${verifyChannelObj.id}>\n- **Review Channel:** <#${reviewChannel}>\n- **Accepted Role(s):** ${formattedVerifiedRoles}\n_ _`,
					inline: false,
				},
				{
					name: "🛠️ Free features you can set up next",
					value:
						`- **Extra Roles:** Set roles to remove on accept, Denied roles, Review Manager roles, and Ping roles.\n` +
						`- **Logs:** Auto-move handled applications to a separate logs channel.\n` +
						`- **Welcome Messages:** Send a welcome message in your server on approval.\n` +
						`- **Auto-Threads:** Auto-create discussion threads on incoming submissions.\n` +
						`- **Custom Embeds:** Custom colors, titles, descriptions, and images.\n_ _`,
					inline: false,
				},
				{
					name: "✨ Premium features you can set up next",
					value:
						`- **Timers & Limits:** Auto-kick unverified members, re-apply cooldowns & denied-role failure threshold.\n` +
						`- **Question Branching (Web):** Regex or multiple choice based: Question branching, auto-kick/deny rules & roles.\n` +
						`- **Modern Card Layout (Web):** Visual drag-and-drop builder for way more advanced custom message layouts.\n` +
						`- **Custom Webhook Branding (Web):** Custom bot name & avatar on server-sided messages.\n` +
						`- **Whitelabel bot (Web):** Use your own custom bot token to fully customize your bot's branding, making it look like your own.`,
					inline: false,
				},
			);

		const launchpadButtons = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`generalinfo_${finalApp.id}_edit`)
				.setLabel("Customize in Discord")
				.setStyle("Secondary"),
			new ButtonBuilder()
				.setStyle("Link")
				.setURL(`https://melpo.app/dashboard/${interaction.guild.id}`)
				.setLabel("Open Web Dashboard"),
		);

		await interaction.editReply({ embeds: [launchpadEmbed], components: [launchpadButtons], files: [] });
	} else {
		const finishembed = new EmbedBuilder()
			.setColor("#3f7ff1")
			.setTitle("Setup finished")
			.setDescription(
				`[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe application "${tempApp.name}" has been updated.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nYou can redo or adjust this setup any time by running the \`/setup edit ${tempApp.name}\` command again.\nTry out our dashboard for more customization options and an easier way to manage your applications!`,
			);

		const dashboardlink = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setStyle("Link").setURL("https://melpo.app/overview").setLabel("Open Web Dashboard"),
		);

		await interaction.editReply({ embeds: [finishembed], components: [dashboardlink], files: [] });
	}
};

function cleanConfig(config) {
	if (config?.format === "v2" || Array.isArray(config?.blocks)) return config;
	for (const key in config) {
		if (config[key] === "deleted") {
			delete config[key];
		} else if (typeof config[key] === "object" && config[key] !== null) {
			cleanConfig(config[key]);
			if (Object.keys(config[key]).length === 0) delete config[key];
		}
	}
	return config;
}

// Biome fix : imageDir renamed to _imageDir to mark it as unused.
async function finalizeCustomizationImage(tempApp, sectionKey, _imageDir, guildId) {
	const section = tempApp[sectionKey];

	//if (!section || !section.image) return;
	if (!section?.image) return;

	if (section.image === "deleted") {
		section.image = null;
		//delete from R2
		console.log(
			`Purging images for deleted image in section ${sectionKey} of app ${tempApp.name} on server ${guildId}`,
		);
		await purgeOldImages({ serverId: guildId, appName: tempApp.name, section: sectionKey });
		return;
	}

	if (isR2ImageResource(section.image)) {
		section.image = await finalizeRemoteImage(section.image);
		return;
	}
}

async function finalizeRemoteImage(image) {
	let finalizedImage = image;

	if (image.isTemp) {
		finalizedImage = await promoteCustomizationImage(image);
	}

	await purgeOldImages({
		serverId: finalizedImage.serverId,
		appName: finalizedImage.appName,
		section: finalizedImage.section,
		keepKey: finalizedImage.key,
		filter: "final",
	});

	return finalizedImage;
}

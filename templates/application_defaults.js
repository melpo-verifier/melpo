//============================
//Name  : application_defaults.js
//Usage : Template data for embeds in applications.
//============================

/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: Template vars are included in external files, see below */
//Files used in:
//migration/migrateToApplication.js
//models/Application.js

var def_embeds = {
	//--Verification set start--
	welcome: {
		title: "Welcome {username}!",
		description: "Hello {usermention}, welcome to **${interaction.guild.name}**!",
		color: "#3f7ff1",
	},
	verify_sv_channel: {
		title: "How to verify",
		description: `After clicking the "Apply" button below the bot will DM you some questions in order for you to access the server. You'll have to fill out the complete form in order for the moderators to see your application. \n\nClick the "Apply" button below to start the application`,
		color: "#3f7ff1",
	},
	verify_dm_accepted: {
		title: `Application accepted`,
		description: "Your application for **{appName}** in **${interaction.guild.name}** has been accepted by {modname}!",
		color: "#008000",
	},
	verify_dm_deny: {
		title: `Application Denied`,
		description: "Your application for **{appName}** in **${interaction.guild.name}** has been denied by {modname}!",
		color: "#EB2121",
	},
	verify_dm_start: {
		title: "${interaction.guild.name}'s Verification",
		description:
			'**Welcome to Melpo\'s verification!**\nWelcome {username} to the verification process of ${interaction.guild.name}! Please answer the following questions within 60 minutes. You can cancel the verification any time by clicking "cancel".',
		color: "#3f7ff1",
	},
	verify_dm_finish: {
		title: `Application Completed`,
		description:
			"Your application has been completed successfully and has been sent to review to ${interaction.guild.name}!",
		color: "#008000",
	},
	//--Verification set end--
};

module.exports = def_embeds;

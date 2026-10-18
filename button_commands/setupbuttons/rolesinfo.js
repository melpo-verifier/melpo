const {
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
	StringSelectMenuBuilder,
	RoleSelectMenuBuilder,
	MessageFlags,
} = require("discord.js");
const { getApplicationById, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, whichdefault, context, applicationId, tempApplicationId }) => {
	tempApplicationId =
		tempApplicationId ??
		applicationId ??
		(context?.[1] ? parseInt(context[1], 10) : null) ??
		(context?.[0] ? parseInt(context[0], 10) : null);
	if (!tempApplicationId) {
		return interaction.reply({
			content: "Temp Application ID is missing. Please try again.",
			flags: MessageFlags.Ephemeral,
		});
	}

	whichdefault = whichdefault ?? 0;

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

	const verifiedRole =
		(tempApp.verifiedrole || applicationSetup?.verifiedrole)?.length > 0
			? tempApp.verifiedrole || applicationSetup?.verifiedrole
			: null;
	const unverifiedRole =
		(tempApp.unverifiedrole || applicationSetup?.unverifiedrole)?.length > 0
			? tempApp.unverifiedrole || applicationSetup?.unverifiedrole
			: null;
	const pingRole =
		(tempApp.pingrole || applicationSetup?.pingrole)?.length > 0
			? tempApp.pingrole || applicationSetup?.pingrole
			: null;
	const managerRole =
		(tempApp.managerrole || applicationSetup?.managerrole)?.length > 0
			? tempApp.managerrole || applicationSetup?.managerrole
			: null;
	const questionpingrole =
		(tempApp.questionpingrole || applicationSetup?.questionpingrole)?.length > 0
			? tempApp.questionpingrole || applicationSetup?.questionpingrole
			: null;
	const deniedRole =
		(tempApp.deniedrole || applicationSetup?.deniedrole)?.length > 0
			? tempApp.deniedrole || applicationSetup?.deniedrole
			: null;
	const allowedroles =
		(tempApp.allowedroles || applicationSetup?.allowedroles)?.length > 0
			? tempApp.allowedroles || applicationSetup?.allowedroles
			: null;
	const ignoreroles =
		(tempApp.ignoreroles || applicationSetup?.ignoreroles)?.length > 0
			? tempApp.ignoreroles || applicationSetup?.ignoreroles
			: null;
	const pendingrole =
		(tempApp.pendingrole || applicationSetup?.pendingrole)?.length > 0
			? tempApp.pendingrole || applicationSetup?.pendingrole
			: null;
	const deniedremoveroles =
		(tempApp.deniedremoveroles || applicationSetup?.deniedremoveroles)?.length > 0
			? tempApp.deniedremoveroles || applicationSetup?.deniedremoveroles
			: null;

	//Note : Static invite token.
	const generalembed = new EmbedBuilder()
		.setColor("#3f7ff1")
		.setTitle("Roles setup")
		.setDescription(
			"[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nHere you can view and edit the roles assigned, removed, or pinged during the application process.",
		)
		.addFields(
			{
				name: "Accepted Roles `required`",
				value: `*Role(s) assigned when users get accepted*\n${verifiedRole ? verifiedRole.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up (REQUIRED)"}`,
			},
			{
				name: "Auto Role `optional`",
				value: `*⚠️ Moved to server configuration! (\`/setup server\`)!*`,
			},
			{
				name: "Roles to remove on accept `optional`",
				value: `*Role(s) to remove from users upon acceptance*\n${unverifiedRole ? unverifiedRole.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Application Ping `optional`",
				value: `*Role(s) that gets pinged with every new application*\n${pingRole ? pingRole.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Reviewer Roles `optional`",
				value: `*Users with this role can review applications (no roles = everyone can review)*\n${managerRole ? managerRole.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Question Ping `optional`",
				value: `*Role(s) that gets pinged when a user answers a question*\n${questionpingrole ? questionpingrole.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Denied Roles `optional`",
				value: `*Role(s) assigned when a user's application is denied*\n${deniedRole ? deniedRole.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Allowed Roles `optional`",
				value: `*Whitelist of roles required to start verification*\n${allowedroles ? allowedroles.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Ignore Roles `optional`",
				value: `*Blocklist of roles forbidden from starting verification (e.g. pending users)*\n${ignoreroles ? ignoreroles.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Pending Role `optional`",
				value: `*Assigned while user is under review*\n${pendingrole ? pendingrole.map((role) => `<@&${role}>`).join(", ") : "None"}`,
			},
			{
				name: "Roles to remove on deny `optional`",
				value: `*Role(s) to remove from users upon denial*\n${deniedremoveroles ? deniedremoveroles.map((role) => `<@&${role}>`).join(", ") : "None"}`,
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

	const selectRoleMenu = new StringSelectMenuBuilder()
		.setCustomId(`selectRoleMenu_${tempApplicationId}`)
		.setPlaceholder("Select what role you want to edit")
		.addOptions(
			{
				label: "Accepted Roles",
				description: "Role(s) assigned when users get accepted",
				value: "verifiedRole",
				default: whichdefault === 0,
			},
			{
				label: "Roles to remove on accept",
				description: "Role(s) to remove from users upon acceptance",
				value: "unverifiedRole",
				default: whichdefault === 1,
			},
			{
				label: "Application Ping",
				description: "Role(s) that gets pinged with every new application",
				value: "pingRole",
				default: whichdefault === 2,
			},
			{
				label: "Reviewer Roles",
				description: "Users with this role can review applications",
				value: "managerRole",
				default: whichdefault === 3,
			},
			{
				label: "Question Ping",
				description: "Role(s) that gets pinged when a user answers a question",
				value: "questionpingrole",
				default: whichdefault === 4,
			},
			{
				label: "Denied Roles",
				description: "Role(s) assigned when a user's application is denied",
				value: "deniedRole",
				default: whichdefault === 5,
			},
			{
				label: "Allowed Roles",
				description: "Whitelist of roles required to start verification",
				value: "allowedroles",
				default: whichdefault === 6,
			},
			{
				label: "Ignore Roles",
				description: "Blocklist of roles forbidden from starting verification (e.g. pending users)",
				value: "ignoreroles",
				default: whichdefault === 7,
			},
			{
				label: "Pending Role",
				description: "Assigned while user is under review",
				value: "pendingrole",
				default: whichdefault === 8,
			},
			{
				label: "Roles to remove on deny",
				description: "Role(s) to remove from users upon denial",
				value: "deniedremoveroles",
				default: whichdefault === 9,
			},
		);

	const verifiedRoleMenu = new RoleSelectMenuBuilder()
		.setCustomId(`roleMenu_${whichdefault}_${tempApplicationId}`)
		.setPlaceholder("Select role to add/edit")
		.setMinValues(0)
		.setMaxValues(10)
		.setDefaultRoles(
			(whichdefault === 0
				? (verifiedRole ?? [])
				: whichdefault === 1
					? (unverifiedRole ?? [])
					: whichdefault === 2
						? (pingRole ?? [])
						: whichdefault === 3
							? (managerRole ?? [])
							: whichdefault === 4
								? (questionpingrole ?? [])
								: whichdefault === 5
									? (deniedRole ?? [])
									: whichdefault === 6
										? (allowedroles ?? [])
										: whichdefault === 7
											? (ignoreroles ?? [])
											: whichdefault === 8
												? (pendingrole ?? [])
												: whichdefault === 9
													? (deniedremoveroles ?? [])
													: []
			).slice(0, 10),
		);

	const rolemenus = [
		new ActionRowBuilder().setComponents(selectRoleMenu),
		new ActionRowBuilder().setComponents(verifiedRoleMenu),
	];

	const categoryButtons = createCategoryButtons(tempApplicationId, 1); // 1 = Roles is disabled

	const payload = {
		content: "",
		embeds: [generalembed],
		components: [categoryButtons, ...rolemenus, finishbuttons],
		files: [],
	};

	if (interaction.replied || interaction.deferred) {
		await interaction.message.edit(payload);
	} else {
		await interaction.update(payload);
	}
};

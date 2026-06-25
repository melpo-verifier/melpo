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

	// const verifiedRole = tempApp.verifiedrole?.length > 0 ? tempApp.verifiedrole : applicationSetup?.verifiedrole;
	// const unverifiedRole = tempApp.unverifiedrole?.length > 0 ? tempApp.unverifiedrole : applicationSetup?.unverifiedrole;
	// const pingRole = tempApp.pingrole?.length > 0 ? tempApp.pingrole : applicationSetup?.pingrole;
	// const managerRole = tempApp.managerrole?.length > 0 ? tempApp.managerrole : applicationSetup?.managerrole;
	const verifiedRole =
		(tempApp.verifiedrole || applicationSetup.verifiedrole)?.length > 0
			? tempApp.verifiedrole || applicationSetup.verifiedrole
			: null;
	const unverifiedRole =
		(tempApp.unverifiedrole || applicationSetup.unverifiedrole)?.length > 0
			? tempApp.unverifiedrole || applicationSetup.unverifiedrole
			: null;
	const pingRole =
		(tempApp.pingrole || applicationSetup.pingrole)?.length > 0 ? tempApp.pingrole || applicationSetup.pingrole : null;
	const managerRole =
		(tempApp.managerrole || applicationSetup.managerrole)?.length > 0
			? tempApp.managerrole || applicationSetup.managerrole
			: null;
	const questionpingrole =
		(tempApp.questionpingrole || applicationSetup.questionpingrole)?.length > 0
			? tempApp.questionpingrole || applicationSetup.questionpingrole
			: null;

	//Note : Static invite token.
	const generalembed = new EmbedBuilder()
		.setColor("#3f7ff1")
		.setTitle("Roles setup")
		.setDescription(
			"[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nHere you can view and edit the questions that will be asked to users when they apply for verification.",
		)
		.addFields(
			{
				name: "Verified Role (Member Role) `required`",
				value: `*Role(s) assigned when users get verified*\n${verifiedRole ? verifiedRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up (REQUIRED)"}`,
			},
			{
				name: "Auto Role `optional`",
				value: `*⚠️ Moved to server configuration! (\`/setup server\`)!*`,
			},
			{
				name: "Unverified Role `optional`",
				value: `*Role(s) to remove from users upon verification*\n${unverifiedRole ? unverifiedRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
			},
			{
				name: "Verification Ping Role `optional`",
				value: `*Role(s) that gets pinged with every new application*\n${pingRole ? pingRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
			},
			{
				name: "Verification Manager Role `optional`",
				value: `*Users with this role can manage applications (no roles = everyone can manage)*\n${managerRole ? managerRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
			},
			{
				name: "Question Ping Role `optional`",
				value: `*Role(s) that gets pinged when a user answers a question*\n${questionpingrole ? questionpingrole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
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
				label: "Verified Role (Member Role)",
				description: `Role(s) assigned when users get verified`,
				value: "verifiedRole",
				default: whichdefault === 0 /*? true : false*/,
			},
			{
				label: "Unverified Role",
				description: "Role(s) to remove from users upon verification",
				value: "unverifiedRole",
				default: whichdefault === 1 /*? true : false*/,
			},
			{
				label: "Verification Ping Role",
				description: "Role(s) that gets pinged with every new application",
				value: "pingRole",
				default: whichdefault === 2 /*? true : false*/,
			},
			{
				label: "Verification Manager Role",
				description: "Users with this role can manage applications",
				value: "managerRole",
				default: whichdefault === 3 /*? true : false*/,
			},
			{
				label: "Question Ping Role",
				description: "Role(s) that gets pinged when a user answers a question",
				value: "questionpingrole",
				default: whichdefault === 4 /*? true : false*/,
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
								: []
			).slice(0, 10),
		);

	const rolemenus = [
		new ActionRowBuilder().setComponents(selectRoleMenu),
		new ActionRowBuilder().setComponents(verifiedRoleMenu),
	];

	const categoryButtons = createCategoryButtons(tempApplicationId, 1); // 1 = Roles is disabled

	await interaction.update({
		content: "",
		embeds: [generalembed],
		components: [categoryButtons, ...rolemenus, finishbuttons],
		files: [],
	});
};

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

const ROLE_CONFIGS = [
	{
		type: "notice",
		name: "Auto Role `optional`",
		value: "*⚠️ Moved to server configuration! (`/setup server`)!*",
	},
	{
		key: "verifiedrole",
		label: "Accepted Roles",
		description: "Role(s) assigned when users get accepted",
		required: true,
	},
	{
		key: "unverifiedrole",
		label: "Roles to remove on accept",
		description: "Role(s) to remove from users upon acceptance",
	},
	{
		key: "deniedrole",
		label: "Denied Roles",
		description: "Role(s) assigned when a user's application is denied",
	},
	{
		key: "deniedremoveroles",
		label: "Roles to remove on deny",
		description: "Role(s) to remove from users upon denial",
	},

	{
		key: "allowedroles",
		label: "Allowed Roles",
		description: "Whitelist of roles required to start verification",
	},
	{
		key: "ignoreroles",
		label: "Ignore Roles",
		description: "Blocklist of roles forbidden from starting verification (e.g. pending users)",
	},
	{
		key: "pendingrole",
		label: "Pending Role",
		description: "Assigned while user is under review",
	},

	{
		key: "managerrole",
		label: "Reviewer Roles",
		description: "Users with this role can review applications (no roles = everyone can review)",
	},
	{
		key: "pingrole",
		label: "Application Ping",
		description: "Role(s) that gets pinged with every new application",
	},
	{
		key: "questionpingrole",
		label: "Question Ping",
		description: "Role(s) that gets pinged when a user answers a question",
	},
];

const editableRoles = ROLE_CONFIGS.filter((c) => c.key);

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

	const activeConfig = editableRoles.find((c) => c.key === whichdefault) ?? editableRoles[0];

	const getRolesForConfig = (key) => {
		const roles = tempApp[key] || applicationSetup?.[key];
		return roles && roles.length > 0 ? roles : null;
	};

	const embedFields = ROLE_CONFIGS.map((item) => {
		if (item.type === "notice") {
			return { name: item.name, value: item.value };
		}
		const roles = getRolesForConfig(item.key);
		const formattedRoles = roles
			? roles.map((r) => `<@&${r}>`).join(", ")
			: item.required
				? "No role(s) set up (REQUIRED)"
				: "None";

		return {
			name: `${item.label} \`${item.required ? "required" : "optional"}\``,
			value: `*${item.description}*\n${formattedRoles}`,
		};
	});

	//Note : Static invite token.
	const generalembed = new EmbedBuilder()
		.setColor("#3f7ff1")
		.setTitle("Roles setup")
		.setDescription(
			"[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nHere you can view and edit the roles assigned, removed, or pinged during the application process.",
		)
		.addFields(embedFields);

	const selectRoleMenu = new StringSelectMenuBuilder()
		.setCustomId(`selectRoleMenu_${tempApplicationId}`)
		.setPlaceholder("Select what role you want to edit")
		.addOptions(
			editableRoles.map((config) => ({
				label: config.label,
				description: config.description.slice(0, 100),
				value: config.key,
				default: config.key === activeConfig.key,
			})),
		);

	const activeRoleValues = getRolesForConfig(activeConfig.key) ?? [];
	const verifiedRoleMenu = new RoleSelectMenuBuilder()
		.setCustomId(`roleMenu_${activeConfig.key}_${tempApplicationId}`)
		.setPlaceholder("Select role to add/edit")
		.setMinValues(0)
		.setMaxValues(10)
		.setDefaultRoles(activeRoleValues.slice(0, 10));

	const finishbuttons = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`finishsetup_${tempApplicationId}`).setLabel("Finish Setup").setStyle("Success"),
		new ButtonBuilder().setCustomId(`cancelsetup_${tempApplicationId}`).setLabel("Cancel").setStyle("Danger"),
		new ButtonBuilder()
			.setLabel("Configure on dashboard")
			.setStyle("Link")
			.setURL(`https://melpo.app/dashboard/${interaction.guild.id}`),
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

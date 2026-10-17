const {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	PermissionFlagsBits,
	MessageFlags,
	AttachmentBuilder,
} = require("discord.js");
const { isPremiumServer } = require("../../js/DBFunctions.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("kickunverified")
		.setDescription(
			"Bulk kick members based on role and time in server (Premium) (command asks for confirmation first)",
		)
		.setContexts(0)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addStringOption((option) =>
			option
				.setName("mode")
				.setDescription("Select whether to kick members with or without the role")
				.setRequired(true)
				.addChoices(
					{ name: "Members WITHOUT role", value: "without_role" },
					{ name: "Members WITH role", value: "with_role" },
				),
		)
		.addRoleOption((option) => option.setName("role").setDescription("The role to check for").setRequired(true))
		.addIntegerOption((option) =>
			option
				.setName("duration")
				.setDescription("Amount of time the member must have been in the server")
				.setRequired(true)
				.setMinValue(1),
		)
		.addStringOption((option) =>
			option
				.setName("unit")
				.setDescription("Time unit (hours or days)")
				.setRequired(true)
				.addChoices({ name: "Hours", value: "hours" }, { name: "Days", value: "days" }),
		)
		.addBooleanOption((option) =>
			option
				.setName("send_dm")
				.setDescription("Whether to attempt to send a DM to members before kicking (default: false)")
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName("reason")
				.setDescription("Reason for the kick (used in Audit Log and sent in member DMs)")
				.setMaxLength(450)
				.setRequired(false),
		),

	async execute({ interaction }) {
		if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
			return interaction.reply({
				content: "You need `Administrator` permissions to use this command.",
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const isPremium = await isPremiumServer(interaction.guild.id);
		if (!isPremium) {
			const premiumEmbed = new EmbedBuilder()
				.setColor("#3f7ff1")
				.setTitle("⭐ Premium Feature")
				.setDescription(
					"The `/kickunverified` command is an exclusive **Melpo Premium** feature!\n\n" +
						"Upgrade to Melpo Premium to unlock this command, way more advanced customization options, custom branding, and automated schedulers.\n\n" +
						"[Support on Ko-Fi](https://ko-fi.com/melpo) • [Premium Info](https://melpo.app/premium) • [Support Server](https://discord.gg/jjGAwwwxZz)",
				);

			let purchaseButton;

			if (process.env.PREMIUM_SKU_ID) {
				purchaseButton = new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(process.env.PREMIUM_SKU_ID);
			} else {
				purchaseButton = new ButtonBuilder()
					.setCustomId("premium_dummy")
					.setLabel("Get Premium (Discord)")
					.setStyle(ButtonStyle.Primary);
			}

			const linkButtons = new ActionRowBuilder().addComponents(
				purchaseButton,
				new ButtonBuilder()
					.setLabel("Get Premium (Ko-Fi)")
					.setStyle(ButtonStyle.Link)
					.setURL("https://ko-fi.com/melpo"),
				new ButtonBuilder()
					.setLabel("Support Server")
					.setStyle(ButtonStyle.Link)
					.setURL("https://discord.gg/jjGAwwwxZz"),
			);

			return interaction.editReply({ embeds: [premiumEmbed], components: [linkButtons] });
		}

		const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
		if (!botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
			return interaction.editReply({
				content: "I do not have the `Kick Members` permission in this server.",
			});
		}

		const targetRole = interaction.options.getRole("role");
		if (targetRole.id === interaction.guild.id) {
			return interaction.editReply({
				content: "You cannot target the `@everyone` role with `/kickunverified`. Please specify a specific role.",
			});
		}

		const mode = interaction.options.getString("mode");
		const duration = interaction.options.getInteger("duration");
		const unit = interaction.options.getString("unit");
		const sendDm = interaction.options.getBoolean("send_dm") ?? false;
		const customReason = interaction.options.getString("reason");

		const durationMs = duration * (unit === "days" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000);
		const cutoffTimestamp = Date.now() - durationMs;
		const cutoffSeconds = Math.floor(cutoffTimestamp / 1000);

		let allMembers;

		try {
			allMembers = await interaction.guild.members.fetch();
		} catch (error) {
			console.log(error?.data);
			if (error.data?.retry_after) {
				interaction.editReply({
					content: `Failed to fetch members, rate-limited. Please try again in ${error.data.retry_after}s.`,
				});
				return;
			}

			throw error;
		}

		const isExecutorOwner = interaction.guild.ownerId === interaction.user.id;
		const executorHighestPosition = interaction.member.roles.highest.position;

		const matchingCandidates = [];
		const unkickableMembers = [];

		for (const [, member] of allMembers) {
			if (member.user.bot) continue;
			if (!member.joinedTimestamp || member.joinedTimestamp > cutoffTimestamp) continue;

			const hasRole = member.roles.cache.has(targetRole.id);
			const matchesCondition = mode === "without_role" ? !hasRole : hasRole;
			if (!matchesCondition) continue;

			const isProtectedFromExecutor =
				!isExecutorOwner &&
				(member.id === interaction.guild.ownerId || member.roles.highest.position >= executorHighestPosition);

			if (member.kickable && !isProtectedFromExecutor) {
				matchingCandidates.push(member);
			} else {
				unkickableMembers.push(member);
			}
		}

		if (matchingCandidates.length === 0) {
			let message = `No eligible members found ${mode === "without_role" ? "without" : "with"} the <@&${targetRole.id}> role who joined more than ${duration} ${unit} ago.`;
			if (unkickableMembers.length > 0) {
				message += `\n\n⚠️ Found **${unkickableMembers.length}** matching member(s), but they cannot be kicked due to role hierarchy, bot permissions, or server ownership.`;
			}
			return interaction.editReply({ content: message });
		}

		const fileRows = [
			"User ID,Username,Joined At",
			...matchingCandidates.map(
				(m) => `"${m.id}","${m.user.tag.replace(/"/g, '""')}","${new Date(m.joinedTimestamp).toISOString()}"`,
			),
		];
		const candidateAttachment = new AttachmentBuilder(Buffer.from(fileRows.join("\n"), "utf-8"), {
			name: `kick-candidates-${Date.now()}.csv`,
		});

		const sampleMembers = matchingCandidates
			.slice(0, 15)
			.map((m) => `- <@${m.id}> (\`${m.user.tag}\`) - Joined <t:${Math.floor(m.joinedTimestamp / 1000)}:R>`)
			.join("\n");

		const previewDescription =
			`**Target Mode:** ${mode === "without_role" ? "Members **WITHOUT** role" : "Members **WITH** role"}\n` +
			`**Target Role:** <@&${targetRole.id}>\n` +
			`**Minimum Time in Server:** ${duration} ${unit} (Joined before <t:${cutoffSeconds}:f>)\n` +
			`**Send DM before kick:** ${sendDm ? "Yes" : "No"}\n` +
			(customReason ? `**Reason (Audit Log & DM):** ${customReason}\n` : "") +
			`\n**Total to Kick:** \`${matchingCandidates.length}\`` +
			(unkickableMembers.length > 0 ? ` *(+ ${unkickableMembers.length} unkickable due to hierarchy skipped)*` : "") +
			`\n\n**Members Preview (First 15):**\n${sampleMembers}` +
			(matchingCandidates.length > 15
				? `\n\n*...and ${matchingCandidates.length - 15} more. See the attached CSV file for the full list.*`
				: "");

		const confirmEmbed = new EmbedBuilder()
			.setColor("#e74c3c")
			.setTitle("⚠️ Bulk Kick Members")
			.setDescription(previewDescription)
			.setFooter({
				text: "Click 'Confirm Kick' to begin, or 'Cancel' to abort. You have 2 minutes to respond, otherwise the operation will be cancelled.",
			});

		const confirmButtons = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId("kickconfirm")
				.setLabel(`Confirm Kick (${matchingCandidates.length})`)
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId("kickcancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
		);

		const response = await interaction.editReply({
			embeds: [confirmEmbed],
			components: [confirmButtons],
			files: [candidateAttachment],
		});

		let collectedInteraction;
		try {
			collectedInteraction = await response.awaitMessageComponent({
				filter: (i) => i.user.id === interaction.user.id,
				time: 120000,
			});
		} catch {
			return interaction.editReply({
				content: "Confirmation timed out. No members were kicked.",
				embeds: [],
				components: [],
				files: [],
			});
		}

		if (collectedInteraction.customId === "kickcancel") {
			await collectedInteraction.deferUpdate();
			return interaction.editReply({
				content: "Bulk kick cancelled. No members were kicked.",
				embeds: [],
				components: [],
				files: [],
			});
		}

		await collectedInteraction.deferUpdate();

		const graceSeconds = 60;
		const targetTimestamp = Math.floor((Date.now() + graceSeconds * 1000) / 1000);

		const graceEmbed = new EmbedBuilder()
			.setColor("#f39c12")
			.setTitle("Kicking Scheduled")
			.setDescription(
				`**Kicking ${matchingCandidates.length} members will begin <t:${targetTimestamp}:R>.**\n\n` +
					"- Click **Start Now** to skip the countdown and begin immediately.\n" +
					"- Click **Cancel** to cancel before any kicks occur.",
			);

		const graceButtons = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId("kickstartnow").setLabel("Start Now").setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId("kickcancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
		);

		await interaction.editReply({
			embeds: [graceEmbed],
			components: [graceButtons],
			files: [],
		});

		try {
			const graceInteraction = await response.awaitMessageComponent({
				filter: (i) => i.user.id === interaction.user.id,
				time: graceSeconds * 1000,
			});

			if (graceInteraction.customId === "kickcancel") {
				await graceInteraction.deferUpdate();
				return interaction.editReply({
					content: "Bulk kick cancelled. No members were kicked.",
					embeds: [],
					components: [],
					files: [],
				});
			}

			if (graceInteraction.customId === "kickstartnow") {
				await graceInteraction.deferUpdate();
			}
		} catch {}

		let isStopped = false;
		const stopButtons = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId("kickstop").setLabel("Stop Kicking").setStyle(ButtonStyle.Danger),
		);

		const stopCollector = response.createMessageComponentCollector({
			filter: (i) => i.user.id === interaction.user.id && i.customId === "kickstop",
			time: 30 * 60 * 1000,
		});

		stopCollector.on("collect", async (stopInteraction) => {
			isStopped = true;
			await stopInteraction.deferUpdate();
			stopCollector.stop();
		});

		const defaultReason = `Bulk kick: ${duration} ${unit} ${mode === "without_role" ? "without" : "with"} role (${targetRole.name}) by ${interaction.user.tag}`;
		let auditLogReason = customReason ? `${customReason} (by ${interaction.user.tag})` : defaultReason;
		if (auditLogReason.length > 512) {
			auditLogReason = auditLogReason.slice(0, 512);
		}

		const dmReasonText = customReason
			? `\n**Reason:** ${customReason}`
			: `\n**Reason:** Inactive/unverified for longer than ${duration} ${unit} ${mode === "without_role" ? "without" : "with"} the @${targetRole.name} role.`;

		const dmMessage = `You have been kicked from **${interaction.guild.name}**.\n ${dmReasonText}\n\n`;

		let kickedCount = 0;
		let failedCount = 0;
		let dmFailedCount = 0;
		let lastUpdate = 0;
		let webhookExpired = false;

		const kickIntervalMs = sendDm ? 3000 : 2000; //leave enough space to prevent rate limits

		for (let index = 0; index < matchingCandidates.length; index++) {
			if (isStopped) break;

			if (Date.now() - interaction.createdTimestamp > 14.5 * 60 * 1000) {
				webhookExpired = true;
			}

			const member = matchingCandidates[index];

			if (sendDm) {
				try {
					await member.send({ content: dmMessage });
				} catch {
					dmFailedCount++;
				}
			}

			try {
				await member.kick(auditLogReason);
				kickedCount++;
			} catch (err) {
				console.error(`Failed to kick member ${member.id}:`, err.message);
				failedCount++;
			}

			const now = Date.now();
			if (!webhookExpired && (now - lastUpdate >= 3000 || index === matchingCandidates.length - 1)) {
				lastUpdate = now;
				const progressEmbed = new EmbedBuilder()
					.setColor("#3f7ff1")
					.setTitle("Kicking Members in Progress...")
					.setDescription(
						`Progress: **${index + 1} / ${matchingCandidates.length}** (${Math.round(((index + 1) / matchingCandidates.length) * 100)}%)\n\n` +
							`- **Successfully Kicked:** ${kickedCount}\n` +
							`- **Failed:** ${failedCount}` +
							(sendDm ? `\n- **DMs Not Delivered:** ${dmFailedCount}` : "") +
							"\n\n*Click **Stop Kicking** below to halt immediately.*",
					);

				await interaction
					.editReply({
						embeds: [progressEmbed],
						components: [stopButtons],
						files: [],
					})
					.catch((err) => {
						if (err.code === 10015) {
							webhookExpired = true;
						}
					});
			}

			if (index < matchingCandidates.length - 1 && !isStopped) {
				await new Promise((resolve) => setTimeout(resolve, kickIntervalMs));
			}
		}

		stopCollector.stop();

		const finalEmbed = new EmbedBuilder()
			.setColor(isStopped ? "#ffaa00" : "#2ecc71")
			.setTitle(isStopped ? "🛑 Bulk Kick Stopped" : "✅ Bulk Kick Completed")
			.setDescription(
				(isStopped
					? "**The bulk kick operation was stopped by the moderator.**\n\n"
					: "**All members have been processed.**\n\n") +
					`- **Total Members:** ${matchingCandidates.length}\n` +
					`- **Successfully Kicked:** ${kickedCount}\n` +
					`- **Failed / Errors:** ${failedCount}\n` +
					`- **Skipped (Role Hierarchy / Owner):** ${unkickableMembers.length}` +
					(sendDm ? `\n- **DMs Not Delivered (Closed DMs):** ${dmFailedCount}` : ""),
			)
			.setFooter({ text: `Executed by ${interaction.user.tag}` })
			.setTimestamp();

		try {
			await interaction.channel.send({
				embeds: [finalEmbed],
				files: [candidateAttachment],
				components: [],
			});
		} catch {
			await interaction
				.editReply({
					embeds: [finalEmbed],
					components: [candidateAttachment],
					files: [],
				})
				.catch(() => {});
		}

		return;
	},
};

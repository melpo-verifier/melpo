const { Verification, InviteTracker, AdTexts, UserBilling, Submissions } = require("../dbObjects.js");
const {
	ButtonBuilder,
	ActionRowBuilder,
	EmbedBuilder,
	PermissionsBitField,
	MessageFlags,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorSpacingSize,
	SeparatorBuilder,
	MediaGalleryBuilder,
	ThumbnailBuilder,
	SectionBuilder,
	AttachmentBuilder,
	FileBuilder,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { updateVerifications, getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");
const {
	addMessageId,
	sendDenyDM,
	sendKickDM,
	sendVerifyDM,
	sendWelcomeMessage,
	applyRoles,
	createAutoActionContainer,
	VerificationStatus,
} = require("../js/verificationHandler.js");
const { sendWebhookMessage, formatCustomMessage } = require("../js/messageHelper.js");
const { scheduleAction, cancelPendingActions } = require("../js/scheduler.js");
const { encryptData, decryptData } = require("../js/DBFunctions.js");
const { isPremiumServer } = require("../js/DBFunctions.js");

const activeVerifications = new Map();
const rateLimitMap = new Map();
const rateLimitMS = 15000;

setInterval(() => {
	const now = Date.now();
	const expiredSessions = [];
	const expiredRateLimits = [];

	for (const [key, session] of activeVerifications.entries())
		if (now - session.startTime > 4 * 60 * 60 * 1000) expiredSessions.push(key); // older than 4 hours gets deleted

	for (const [key, timestamp] of rateLimitMap.entries()) if (now - timestamp > 60000) expiredRateLimits.push(key);

	expiredSessions.forEach((key) => void activeVerifications.delete(key));
	expiredRateLimits.forEach((key) => void rateLimitMap.delete(key));
}, 600000);

async function handleApplicationStart({ interaction, client, applicationId }) {
	const rateLimitKey = `${interaction.user.id}`;

	if (rateLimitMap.has(rateLimitKey)) {
		const timeSinceLastAttempt = Date.now() - rateLimitMap.get(rateLimitKey);
		const timeLeft = Math.ceil((rateLimitMS - timeSinceLastAttempt) / 1000);

		if (timeLeft > 0) {
			return await interaction.editReply({
				content: `Please wait ${timeLeft} seconds before starting another application.`,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			rateLimitMap.delete(rateLimitKey);
		}
	}

	const encryptionKey = process.env.ENCRYPTION_KEY;
	if (!encryptionKey) {
		console.error("ENCRYPTION_KEY is not configured!!");
		return await interaction.editReply({
			content: "Oops! An error occured, we're trying to fix this as soon as possible!",
			flags: MessageFlags.Ephemeral,
		});
	}

	if (activeVerifications.has(interaction.user.id)) {
		const existingSession = activeVerifications.get(interaction.user.id);
		if (existingSession?.startTime && Date.now() - existingSession.startTime > 4 * 60 * 60 * 1000)
			activeVerifications.delete(interaction.user.id);

		const hasPendingProgress = existingSession?.sessionId
			? await Submissions.findOne({
					where: {
						message_id: existingSession.sessionId,
						user_id: interaction.user.id,
						guild_id: interaction.guild.id,
						status: "pending",
					},
				})
			: null;

		if (!hasPendingProgress) activeVerifications.delete(interaction.user.id);
	}

	if (activeVerifications.has(interaction.user.id)) {
		return await interaction.editReply({
			content: `<@${interaction.user.id}>, you already have an active application session! Please complete or cancel it before starting a new one.`,
			flags: MessageFlags.Ephemeral,
		});
	}

	rateLimitMap.set(rateLimitKey, Date.now());

	try {
		const user = interaction.user;
		const guildId = interaction.guild.id;

		// Find the application by ID
		const { application, error } = await getApplicationByIdWithFallback(applicationId, guildId);

		if (error || !application) {
			return await interaction.editReply({
				content: `This application setup is not configured correctly. Please contact the server staff. (Application not found)`,
				flags: MessageFlags.Ephemeral,
			});
		}

		applicationId = application.id;
		const appName = application.name;

		const member = interaction.member ?? (await interaction.guild.members.fetch(user.id).catch(() => null));
		const memberHasRole = (roleId) => {
			if (!member?.roles) return false;
			if (member.roles.cache && typeof member.roles.cache.has === "function") {
				return member.roles.cache.has(roleId);
			}
			if (Array.isArray(member.roles)) {
				return member.roles.includes(roleId);
			}
			return false;
		};

		// 1. Ignore roles check
		const ignoreRoles = Array.isArray(application.ignoreroles) ? application.ignoreroles : [];
		if (ignoreRoles.length > 0 && ignoreRoles.some((roleId) => memberHasRole(roleId))) {
			return await interaction.editReply({
				content: `You cannot apply because you have a restricted role. (${ignoreRoles
					.filter((roleId) => memberHasRole(roleId))
					.map((roleId) => `<@&${roleId}>`)
					.join(", ")})`,
				flags: MessageFlags.Ephemeral,
			});
		}

		// 2. Allowed roles check
		const allowedRoles = Array.isArray(application.allowedroles) ? application.allowedroles : [];
		if (allowedRoles.length > 0 && !allowedRoles.some((roleId) => memberHasRole(roleId))) {
			return await interaction.editReply({
				content: `You do not have the required role to apply. You need one of the following roles: ${allowedRoles.map((roleId) => `<@&${roleId}>`).join(", ")}`,
				flags: MessageFlags.Ephemeral,
			});
		}
		const {
			verifychannel: verifyChannelId,
			reviewchannel: verifyLogsChannelId,
			questions: botQuestions,
			pingrole: pingStaffRoleId,
		} = application;

		let parsedQuestions;
		try {
			if (!botQuestions || !Array.isArray(botQuestions) || botQuestions.length === 0) {
				return await interaction.editReply({
					content: `No questions are configured. Please contact the server staff.`,
					flags: MessageFlags.Ephemeral,
				});
			}

			parsedQuestions = botQuestions.map((question, index) => {
				let parsed;
				if (typeof question === "string") {
					try {
						try {
							parsed = JSON.parse(question);
						} catch (parseError) {
							console.error(`Failed to parse question: ${parseError.message}`);
							parsed = question;
						}
					} catch (error) {
						throw new Error(`Invalid question ${index + 1}: ${error.message}`);
					}
				} else if (typeof question === "object" && question !== null) {
					parsed = question;
				} else {
					throw new Error(`Invalid question ${index + 1}: Not a string or object`);
				}

				if (!parsed.id) parsed.id = `question-${index}`;

				// parse the internal mcq and regex
				parsed.mcq = Array.isArray(parsed.mcq)
					? parsed.mcq.map((option) => (typeof option === "string" ? { label: option } : option))
					: [];
				parsed.regexBranches = Array.isArray(parsed.regexBranches) ? parsed.regexBranches : [];

				if (!parsed.content || parsed.content.trim().length === 0)
					throw new Error(`Question ${index + 1} has empty content`);

				return parsed;
			});
		} catch (error) {
			console.error(`Question parsing error for guild ${guildId}:`, error);
			return await interaction.editReply({
				content: `Question configuration error: ${error.message}. Please contact the server staff.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		const isSetupComplete = verifyChannelId && verifyLogsChannelId && parsedQuestions.length > 0;
		if (!isSetupComplete) {
			return await interaction.editReply({
				content: `<@${user.id}>, I am not completely set up yet! If you are a moderator, please complete the setup process first.`,
				flags: MessageFlags.Ephemeral,
			});
		}

		const verifyLogsChannel = interaction.guild.channels.cache.get(verifyLogsChannelId);
		if (!verifyLogsChannel) {
			return await interaction.editReply({
				content: `<@${user.id}>, the review channel could not be found! Please contact server staff.`,
			});
		}

		const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
		const botPermissions = verifyLogsChannel.permissionsFor(botMember);
		//if (
		//	!botPermissions ||
		//	!botPermissions.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])
		//) {
		if (!botPermissions?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])) {
			return await interaction.editReply({
				content: `<@${user.id}>, I don't have permissions to send messages in the review channel!`,
				flags: MessageFlags.Ephemeral,
			});
		}

		if (activeVerifications.has(user.id) && activeVerifications.get(user.id).startTime + 4 * 3600000 < Date.now()) {
			console.error(
				"User has an active application session but it has been more than 4 hours. Clearing the session. THIS SHOULDNT HAPPEN",
			);
			activeVerifications.delete(user.id);
		}

		const configId = String(applicationId);
		const dbObjectsPath = require.resolve("../dbObjects.js");
		const DBFunctionsPath = require.resolve("../js/DBFunctions.js");
		let resumeState = null;
		let resumeCreatedAt = null;
		let sessionId = uuidv4();

		const pendingProgressRecords = await Submissions.findAll({
			where: {
				user_id: user.id,
				guild_id: guildId,
				app_id: configId,
				status: "pending",
			},
			order: [["updatedAt", "DESC"]],
		});

		for (const progressRecord of pendingProgressRecords) {
			const payload = decryptData(progressRecord.data, encryptionKey);
			if (!payload) continue;

			if (payload.currentQuestionId) {
				resumeState = payload;
				resumeCreatedAt = progressRecord.createdAt ? new Date(progressRecord.createdAt).getTime() : null;
				sessionId = progressRecord.message_id;
				break;
			}
		}

		// Create DM channel and send start Embed
		try {
			const dmChannel = await user.createDM();
			const cancelbutton = new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`cancelverification-${sessionId}`).setLabel("Cancel").setStyle("Danger"),
			);

			const payload = await formatCustomMessage(application.startmessage, {
				user,
				interaction,
				guild: interaction.guild,
				appName,
				application,
				defaultColor: "#3f7ff1",
				defaultFooter: `Application: ${appName} | Click "cancel" to cancel the application.`,
			});

			let startmessage;

			try {
				startmessage = await dmChannel.send(payload);
			} catch (error) {
				if (error.code === 50007 || error.code === 50278) {
					// Cannot send messages to this user
					await interaction.editReply({
						content: `<@${user.id}>, I cannot send you DMs! Please enable DMs from server members and try again.`,
						flags: MessageFlags.Ephemeral,
					});
					return; // DMs are closed or the user has blocked the bot
				} else {
					throw error;
				}
			}

			const startedEmbed = new EmbedBuilder()
				.setTitle("Application Started")
				.setDescription(
					`Application started, check your DMs or [click here](https://discord.com/channels/@me/${dmChannel.id}/${startmessage.id})!`,
				)
				.setColor("#3f7ff1");

			await interaction.editReply({ embeds: [startedEmbed], flags: MessageFlags.Ephemeral });
			const startedAt = resumeState ? resumeState.startedAt || resumeCreatedAt || null : Date.now();
			activeVerifications.set(user.id, { sessionId: sessionId, startTime: Date.now() });
			const isPremium = await isPremiumServer(guildId);

			if (
				//sharded instances
				// client.user.id === "849613551080701983" ||
				// client.user.id === "916372883087974440"
				client.cluster
			) {
				await client.cluster
					.broadcastEval(Verificationfunc, {
						context: {
							userid: user.id,
							dmChannelId: dmChannel.id,
							botQuestions: parsedQuestions,
							cancelbutton: cancelbutton.toJSON(),
							sessionId: sessionId,
							guildId,
							configId,
							dbObjectsPath,
							DBFunctionsPath,
							encryptionKey,
							resumeState,
							isPremium,
							imageSubmission: application.imageSubmission ?? true,
							startedAt,
						},
						cluster: 0,
					})
					.then(async (results) => {
						const [reason, responses, sessionStartedAt, actionReason, actionRoles, shouldNotifyLogs = true] =
							results[0];
						activeVerifications.delete(user.id);
						await processVerificationResult(
							user,
							reason,
							responses,
							interaction,
							parsedQuestions,
							dmChannel,
							pingStaffRoleId,
							guildId,
							verifyLogsChannel,
							application.finishmessage,
							client,
							application.usethreads,
							appName,
							applicationId,
							sessionId,
							application,
							sessionStartedAt || startedAt,
							actionReason,
							actionRoles,
							shouldNotifyLogs,
						);
					})
					.catch(async (error) => {
						activeVerifications.delete(user.id);
						await Submissions.destroy({ where: { message_id: sessionId } }).catch(() => {});

						const isExpected = error.toString().includes("was canceled") || error.toString().includes("timed out");
						if (!isExpected) throw error;
					});
			} else {
				//non sharded instances
				try {
					const [reason, responses, sessionStartedAt, actionReason, actionRoles, shouldNotifyLogs = true] =
						await Verificationfunc(client, {
							userid: user.id,
							dmChannelId: dmChannel.id,
							botQuestions: parsedQuestions,
							cancelbutton: cancelbutton,
							sessionId: sessionId,
							guildId,
							configId,
							dbObjectsPath,
							DBFunctionsPath,
							encryptionKey,
							resumeState,
							isPremium,
							imageSubmission: application.imageSubmission ?? true,
							startedAt,
						});

					activeVerifications.delete(user.id);
					await processVerificationResult(
						user,
						reason,
						responses,
						interaction,
						parsedQuestions,
						dmChannel,
						pingStaffRoleId,
						guildId,
						verifyLogsChannel,
						application.finishmessage,
						client,
						application.usethreads,
						appName,
						applicationId,
						sessionId,
						application,
						sessionStartedAt || startedAt,
						actionReason,
						actionRoles,
						shouldNotifyLogs,
					);
				} catch (error) {
					activeVerifications.delete(user.id);
					await Submissions.destroy({ where: { message_id: sessionId } }).catch(() => {});

					const isExpected = error.toString().includes("was canceled") || error.toString().includes("timed out");
					if (!isExpected) throw error;
				}
			}
		} catch (error) {
			const isExpected = error.toString().includes("was canceled") || error.toString().includes("timed out");
			if (!isExpected) throw error;
		}
	} catch (error) {
		console.error("Application error:", error);
		await interaction
			.followUp({
				content: `An error occurred during the application process! Please try again later or contact the server staff/[Melpo's Support server](https://discord.gg/jjGAwwwxZz). (${error.message})`,
				flags: MessageFlags.Ephemeral,
			})
			.catch(() => {});
	} finally {
		activeVerifications.delete(interaction.user.id);
	}
}

function formatDuration(durationMs) {
	if (!durationMs || durationMs < 0) return "0s";
	const totalSeconds = Math.floor(durationMs / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

async function constructApplicationEmbed(
	user,
	questions,
	answers,
	serverId,
	client,
	pingStaffRoleId,
	appName,
	durationString = null,
	isAutoAction = false,
) {
	const guild = client.guilds.cache.get(serverId);
	if (!guild) return { container: null, wasTruncated: false, fullText: null };

	const [guildmember, invitetracker] = await Promise.all([
		guild.members.fetch(user.id).catch(() => null),
		InviteTracker.findOne({ where: { unique_id: `${user.id}_${serverId}` } }),
	]);

	//const headerText = `${pingStaffRoleId ? pingStaffRoleId?.map((role) => `<@&${role}>`).join(", ") + "\n" : ""}### ${user.globalName ?? user.username}'s ${appName}\n[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.username}\` <@${user.id}>\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(guildmember?.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`;
	//Biome fix : Restructured code for compliance.
	const headerText = String(
		pingStaffRoleId
			? pingStaffRoleId
					?.map((role) => `<@&${role}>`)
					.join(", ")
					.concat("\n")
			: "",
	)
		.concat(`### ${user.globalName ?? user.username}'s ${appName}\n`)
		.concat(
			`[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n`,
		)
		.concat(`**Username:** \`${user.username}\` <@${user.id}>\n**User ID:** \`${user.id}\`\n`)
		.concat(`**Account created:** <t:${Math.floor(user.createdAt / 1000)}:R>\n`)
		.concat(`**Joined server:** <t:${Math.floor(guildmember?.joinedTimestamp / 1000)}:R>`)
		.concat(durationString ? `\n**Duration:** \`${durationString}\`` : "")
		//Observation : `null` has `null` uses is a pattern occasionally seen, will need more profiling - Mat
		//Note : Speculation is DB null edge case potentially.
		.concat(
			invitetracker
				? `\n**Invited by:** ${
						invitetracker.id === "vanity" || invitetracker.id === "Unknown"
							? `\`${invitetracker.id}\``
							: `<@${invitetracker.id}>`
					} (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)`
				: "",
		);
	const accentColor = isAutoAction ? 0xeb2121 : 4161521;
	const container = new ContainerBuilder({ accent_color: accentColor })
		.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder({ content: headerText }))
				.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: user.displayAvatarURL({ size: 1024 }) } })),
		)
		.addSeparatorComponents(new SeparatorBuilder({ spacing: SeparatorSpacingSize.Small }));

	if (answers.length > 0) {
		let totalCharacterCount = headerText.length;
		let absoluteTotalCharacterCount = 0;
		const MAX_TOTAL_CHARACTERS = 3800;
		let wasTruncated = false;
		const fullTextLines = [];

		answers.forEach((answer) => {
			absoluteTotalCharacterCount += answer.questionContent.length + (answer.content?.length || 0);
		});

		answers.forEach((answer, index) => {
			const questioncontent = answer.questionContent.replace(/(\*\*|__|\*|~~|`|>)/g, "");
			const rawContent = answer.content || "No answer provided";
			//const questionNumber = questions.findIndex((q) => q.id === answer.questionId) + 1 || (index + 1);
			const questionNumber = questions.findIndex((q) => q.id === answer.questionId) + 1 || index + 1;
			fullTextLines.push(`Q${questionNumber}: ${questioncontent}`);
			fullTextLines.push(`Answer: ${rawContent}`);
			if (answer.attachments && answer.attachments.length > 0)
				fullTextLines.push(`Attachments: ${answer.attachments.join(", ")}`);

			fullTextLines.push("");

			if (totalCharacterCount >= MAX_TOTAL_CHARACTERS) {
				wasTruncated = true;
				return;
			}

			const questionText =
				absoluteTotalCharacterCount >= MAX_TOTAL_CHARACTERS
					? `**${questionNumber}.** **${questioncontent.slice(0, 10)}...**`
					: `**${questionNumber}.** **${questioncontent}**`;
			const answertext = answer.content || "No answer provided";
			let formattedField = [questionText, `_ _ ${answertext}`].join("\n");

			if (totalCharacterCount + formattedField.length > MAX_TOTAL_CHARACTERS) {
				const remainingCharacters = MAX_TOTAL_CHARACTERS - totalCharacterCount;
				if (remainingCharacters > 100) {
					// Only add if there's meaningful space left
					formattedField = String(formattedField.slice(0, remainingCharacters - 3)).concat("...");
					wasTruncated = true;
				} else {
					wasTruncated = true;
					return;
				}
			}

			totalCharacterCount += formattedField.length;
			container.addTextDisplayComponents(new TextDisplayBuilder({ content: formattedField }));

			if (answer.attachments && answer.attachments.length > 0) {
				const allurls = answer.attachments;
				const mappedurls = allurls?.map((url) => ({ media: { url: url } }));
				container.addMediaGalleryComponents(new MediaGalleryBuilder({ items: mappedurls }));
			}
		});

		if (wasTruncated === false) {
			if (Math.random() < 0.02) {
				const serverOwner = guild?.ownerId;
				const [isPaidUser, adTexts] = await Promise.all([
					UserBilling.findOne({ where: { user_id: serverOwner } }),
					AdTexts.findAll({ where: { type: "application" } }),
				]);

				if (!isPaidUser && adTexts.length > 0) {
					const randomAd = adTexts[Math.floor(Math.random() * adTexts.length)];
					container.addTextDisplayComponents(new TextDisplayBuilder({ content: `\n-# ${randomAd.text}` }));
				}
			}
		}

		const fullText = wasTruncated ? fullTextLines.join("\n") : null;

		if (wasTruncated && fullText) {
			const safeAppName = appName.replace(/[^a-zA-Z0-9_-]/g, "_");
			const name = `${user.id}_${safeAppName}.txt`;
			const buffer = Buffer.from(fullText, "utf-8");
			const attachment = new AttachmentBuilder(buffer, { name });
			container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`));

			return { container, wasTruncated, fullText, attachment };
		}

		return { container, wasTruncated, fullText: fullText };
	}

	return { container, wasTruncated: false, fullText: null };
}

async function processVerificationResult(
	user,
	reason,
	responses,
	interaction,
	botQuestions,
	dmChannel,
	pingStaffRoleId,
	guildId,
	verifyLogsChannel,
	finishmessage,
	client,
	useThreads,
	appName,
	applicationId,
	sessionId,
	application,
	startedAt = null,
	actionReason = null,
	actionRoles = [],
	shouldNotifyLogs = true,
) {
	if (reason === "completed" || reason === "kick" || reason === "deny" || reason === "verify") {
		// Process collected responses and send to verification review channel
		await updateVerifications().catch((err) => console.error("Failed to update verifications:", err));

		user = user || interaction.user;

		const durationString = startedAt ? formatDuration(Date.now() - startedAt) : null;
		const isAutoAction = reason === "kick" || reason === "deny" || reason === "verify";
		const shouldPostReviewOrLog = !isAutoAction || shouldNotifyLogs !== false;
		let channelsent = null;

		if (shouldPostReviewOrLog) {
			const containerResult = await constructApplicationEmbed(
				user,
				botQuestions,
				responses,
				interaction.guild.id,
				client,
				pingStaffRoleId,
				appName,
				durationString,
				isAutoAction,
			);

			//if (!containerResult || !containerResult.container) {
			if (!containerResult?.container) {
				//try to send image to user:
				await dmChannel
					.send({
						content:
							"An error occurred while processing your application. This can happen when you left or have been kicked from the server during your application.",
					})
					.catch(() => {});
				return;
			}

			let { container, attachment } = containerResult;

			if (isAutoAction) {
				const status =
					reason === "kick"
						? VerificationStatus.KICKED
						: reason === "deny"
							? VerificationStatus.DENIED
							: VerificationStatus.VERIFIED;
				container = createAutoActionContainer(container, status, client);
			}

			const isActionActive = reason === "completed";

			//create the buttons
			const verify = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`verify_${applicationId}_${interaction.user.id}`)
					.setLabel("Accept")
					.setStyle("Success"),
				new ButtonBuilder()
					.setCustomId(`deny_${applicationId}_${interaction.user.id}`)
					.setLabel("Deny")
					.setStyle("Danger"),
				new ButtonBuilder()
					.setCustomId(`question_${applicationId}_${interaction.user.id}`)
					.setLabel("Question")
					.setStyle("Primary"),
				new ButtonBuilder()
					.setCustomId(`action_${applicationId}_${interaction.user.id}`)
					.setLabel("Kick")
					.setStyle("Secondary"),
			);

			const sendPayload = {
				flags: [MessageFlags.IsComponentsV2],
				components: [container, isActionActive ? verify : null].filter(Boolean),
				allowedMentions: { parse: ["roles"] },
			};

			if (attachment) sendPayload.files = [attachment];

			let threadName = null;
			if (useThreads === true) threadName = `${user.globalName ?? user.username}'s ${appName}`;

			let outputChannel = verifyLogsChannel;
			if (isAutoAction && application.verifylogs) {
				outputChannel =
					interaction.guild.channels.cache.get(application.verifylogs) ||
					(await interaction.guild.channels.fetch(application.verifylogs).catch(() => null)) ||
					verifyLogsChannel;
			}

			if (outputChannel) {
				channelsent = await sendWebhookMessage(outputChannel, application, sendPayload, threadName);
			}

			//if reason was kick, deny or verify, close the thread
			if (isAutoAction && channelsent?.thread) {
				await channelsent.thread.setArchived(true, "Archiving due to auto-action");
			}
		}

		const finalMessageId = channelsent?.id || sessionId;
		try {
			const encryptionKey = process.env.ENCRYPTION_KEY;
			const finalPayload = {
				responses,
				submittedForReview: true,
				reviewMessageId: channelsent?.id ?? null,
			};

			await Submissions.upsert({
				message_id: finalMessageId,
				user_id: user.id,
				guild_id: guildId,
				app_id: String(applicationId),
				status: reason === "deny" ? "denied" : reason === "kick" ? "kicked" : reason === "verify" ? "verified" : reason,
				data: encryptData(finalPayload, encryptionKey),
			});

			if (sessionId && sessionId !== finalMessageId) await Submissions.destroy({ where: { message_id: sessionId } });
		} catch (progressError) {
			console.error("Error saving final application progress:", progressError);
		}

		if (reason === "completed") {
			if (channelsent?.id) {
				try {
					const [verification, created] = await Verification.findOrCreate({
						where: { userId: user.id },
						defaults: { guildVerifications: { [guildId]: { [applicationId]: [channelsent.id] } } },
					});

					if (!created) {
						await addMessageId(verification, guildId, applicationId, channelsent.id);
					}
				} catch (error) {
					console.error("Error setting user verification:", error);
				}
			}

			if (application.pendingrole && Array.isArray(application.pendingrole) && application.pendingrole.length > 0) {
				const member = await interaction.guild.members.fetch(user.id).catch(() => null);
				if (member) {
					await applyRoles(member, application.pendingrole, null, interaction);
				}
			}

			const payload = await formatCustomMessage(finishmessage, {
				user,
				interaction,
				guild: interaction.guild,
				appName,
				application,
				defaultColor: "#008000",
				defaultFooter: `Application: ${appName}`,
			});

			if (payload) {
				await dmChannel.send(payload).catch((err) => {
					if (err.code === 50007 || err.code === 50278) return;
					console.error(`Failed to send completion DM to user ${user.id}:`, err);
				});
			}

			//Delete any kick-timer if server has setup auto-kick and cancel kick upon submission is enabled
			if (application.cancelKickOnSubmission === true) {
				await cancelPendingActions({
					guildId: interaction.guild.id,
					userId: user.id,
					applicationId: applicationId,
					actionType: "UNVERIFIED_KICK",
				}).catch((err) => console.error(`Failed to cancel pending kick for user ${user.id}:`, err));
			}
		} else {
			let member;
			try {
				member = await interaction.guild.members.fetch(user.id);
			} catch {
				member = { user, id: user.id, displayAvatarURL: user.displayAvatarURL.bind(user) };
			}

			if (reason === "verify") {
				const branchRoles = new Set();
				if (await isPremiumServer(interaction.guild.id)) {
					const questionsMap = new Map(botQuestions.filter((q) => q?.id).map((q) => [q.id, q]));
					for (const resp of responses) {
						const question = questionsMap.get(resp.questionId);
						if (!question) continue;
						if (resp.mcqIndex?.length > 0) {
							resp.mcqIndex.forEach((idx) => {
								const opt = question.mcq?.[idx];
								if (opt?.roles && opt.nextQuestionId !== "kick" && opt.nextQuestionId !== "deny") {
									opt.roles.forEach((r) => void branchRoles.add(r));
								}
							});
						}
						if (
							resp.otherSelected &&
							Array.isArray(question.otherRoles) &&
							question.otherNextQuestionId !== "kick" &&
							question.otherNextQuestionId !== "deny"
						) {
							question.otherRoles.forEach((r) => void branchRoles.add(r));
						}
						if (question.regexBranches && resp.content) {
							for (const regex of question.regexBranches) {
								try {
									const reg = new RegExp(regex.pattern, "i");
									if (
										reg.test(resp.content) &&
										regex.roles &&
										regex.nextQuestionId !== "kick" &&
										regex.nextQuestionId !== "deny"
									) {
										regex.roles.forEach((r) => void branchRoles.add(r));
									}
								} catch {}
							}
						}
					}

					await cancelPendingActions({
						guildId: interaction.guild.id,
						userId: user.id,
						applicationId: applicationId,
						actionType: "UNVERIFIED_KICK",
					}).catch((err) => console.error(`Failed to cancel pending kick for user ${user.id}:`, err));
				}

				const verifiedRoles = application.verifiedrole || [];
				const unverifiedRoles = application.unverifiedrole || [];
				const pendingRoles = application.pendingrole || [];
				const rolesToRemove = [...new Set([...unverifiedRoles, ...pendingRoles])];
				const rolesToApply = [...new Set([...verifiedRoles, ...branchRoles])];

				if (member?.roles) {
					try {
						await applyRoles(member, rolesToApply, rolesToRemove, interaction);
					} catch (e) {
						console.error("Failed to apply roles due to auto-verify", e);
					}
				}

				if (application.verificationwelcomechannel && application.verificationwelcomemessage) {
					const answers = {};
					if (Array.isArray(responses)) {
						responses.forEach((resp, idx) => {
							answers[idx + 1] = resp.content || "";
						});
					}
					await sendWelcomeMessage(
						interaction,
						user,
						application.verificationwelcomechannel,
						application.verificationwelcomemessage,
						verifiedRoles,
						application,
						answers,
						"Automated Action",
					).catch((err) => console.error("Welcome message error on auto-verify:", err));
				}

				await sendVerifyDM(user, application, interaction, verifiedRoles, actionReason, "Automated Action");
			} else if (reason === "deny") {
				const branchDenialRoles = new Set(actionRoles || []);
				if (branchDenialRoles.size === 0 && responses.length > 0) {
					const lastResp = responses[responses.length - 1];
					const question = botQuestions.find((q) => q?.id === lastResp?.questionId);
					if (question) {
						if (
							lastResp.otherSelected &&
							question.otherNextQuestionId === "deny" &&
							Array.isArray(question.otherRoles)
						) {
							question.otherRoles.forEach((r) => void branchDenialRoles.add(r));
						}
						if (lastResp.mcqIndex?.length > 0 && Array.isArray(question.mcq)) {
							lastResp.mcqIndex.forEach((idx) => {
								const opt = question.mcq[idx];
								if (opt?.nextQuestionId === "deny" && Array.isArray(opt.roles)) {
									opt.roles.forEach((r) => void branchDenialRoles.add(r));
								}
							});
						}
						if (question.regexBranches && lastResp.content) {
							for (const regex of question.regexBranches) {
								try {
									const reg = new RegExp(regex.pattern, "i");
									if (reg.test(lastResp.content) && regex.nextQuestionId === "deny" && Array.isArray(regex.roles)) {
										regex.roles.forEach((r) => void branchDenialRoles.add(r));
									}
								} catch {}
							}
						}
					}
				}

				const rolesToApply = [...branchDenialRoles];
				let shouldAssignDeniedRole = true;
				if (
					application.maxdenials &&
					application.deniedrole?.length > 0 &&
					(await isPremiumServer(interaction.guild.id))
				) {
					const denyCount = await Submissions.count({
						where: {
							user_id: user.id,
							guild_id: interaction.guild.id,
							app_id: String(applicationId),
							status: "denied",
						},
					});

					shouldAssignDeniedRole = denyCount >= application.maxdenials;
				}
				if (shouldAssignDeniedRole && Array.isArray(application.deniedrole) && application.deniedrole.length > 0) {
					rolesToApply.push(...application.deniedrole);
				}

				const pendingRoles = application.pendingrole || [];
				const deniedRemoveRoles = application.deniedremoveroles || [];
				const rolesToRemove = [...new Set([...pendingRoles, ...deniedRemoveRoles])];

				if (member?.roles) {
					try {
						await applyRoles(member, rolesToApply, rolesToRemove, interaction);
						if (
							shouldAssignDeniedRole &&
							application.autoRemoveDeniedRoleEnabled &&
							application.autoRemoveDeniedRoleHours > 0 &&
							(await isPremiumServer(interaction.guild.id))
						) {
							await scheduleAction({
								guildId: interaction.guild.id,
								userId: user.id,
								applicationId: application.id,
								actionType: "REMOVE_DENIED_ROLE",
								durationMs: application.autoRemoveDeniedRoleHours * 60 * 60 * 1000,
							}).catch((err) => console.error(`Failed to schedule deny role action for user ${user.id}:`, err));
						}
					} catch (e) {
						console.error("Failed to apply denied role due to auto-action", e);
					}
				}

				await sendDenyDM("Automated Action", user, application, interaction.guild.name, actionReason);
			} else if (reason === "kick") {
				await sendKickDM("Automated Action", user, application, interaction.guild.name, actionReason);
				if (member.kickable) {
					const auditReason = (
						actionReason ? `Auto-kicked during application: ${actionReason}` : "Auto-kicked during application"
					).slice(0, 512);
					await member.kick(auditReason).catch(() => {});
				}
			}
		}
	}
}

async function Verificationfunc(
	c,
	{
		userid,
		dmChannelId,
		botQuestions,
		cancelbutton,
		sessionId,
		guildId,
		configId,
		dbObjectsPath,
		DBFunctionsPath,
		resumeState,
		isPremium,
		imageSubmission = true,
		startedAt,
	},
) {
	const sessionStartedAt = resumeState ? (startedAt ?? resumeState.startedAt ?? null) : (startedAt ?? Date.now());
	return new Promise((resolve, reject) => {
		const { ButtonBuilder, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
		const { Submissions } = require(dbObjectsPath || "../dbObjects.js");

		const numberToEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

		const { encryptData } = require(DBFunctionsPath);

		async function saveProgress(
			responses,
			currentQuestionId,
			currentQuestionIndex,
			currentMessageId,
			currentQuestion,
			submittedForReview = false,
		) {
			const transcript = [...responses];

			if (currentQuestion) {
				const alreadyTracked = transcript.some(
					(entry) => entry.questionId === currentQuestion.id && entry.content == null,
				);
				if (!alreadyTracked) {
					transcript.push({
						questionId: currentQuestion.id,
						questionContent: currentQuestion.content,
						content: null,
						attachments: [],
					});
				}
			}

			const payload = {
				questionObjects: botQuestions,
				transcript,
				responses,
				currentQuestionId,
				currentQuestionIndex,
				currentMessageId,
				dmChannelId,
				submittedForReview,
				startedAt: sessionStartedAt,
			};

			await Submissions.upsert({
				message_id: sessionId,
				user_id: userid,
				guild_id: guildId,
				app_id: String(configId),
				status: "pending",
				data: encryptData(payload),
			});
		}

		async function clearProgress() {
			await Submissions.destroy({ where: { message_id: sessionId } }).catch(() => {});
		}

		const questionMap = new Map();
		const questionIndexMap = new Map();
		botQuestions.forEach((question, index) => {
			if (!question.id) question.id = `question-${index}`;

			questionMap.set(question.id, question);
			questionIndexMap.set(question.id, index);
		});

		function getSequentialNextQuestionId(currentQuestionIndex) {
			return botQuestions[currentQuestionIndex + 1]?.id ?? null;
		}

		function resolveNextQuestionId(nextQuestionId, currentQuestionIndex) {
			if (
				nextQuestionId === "end" ||
				nextQuestionId === "kick" ||
				nextQuestionId === "deny" ||
				nextQuestionId === "verify"
			)
				return nextQuestionId;
			if (nextQuestionId === undefined || nextQuestionId === null || nextQuestionId === "")
				return getSequentialNextQuestionId(currentQuestionIndex);

			return nextQuestionId;
		}

		function getNextQuestionId(
			currentQuestion,
			currentQuestionIndex,
			isPremium,
			selectedOptionIndex,
			answerText,
			selectedOptionCount = 0,
			otherSelected = false,
		) {
			if (!isPremium)
				return {
					nextQuestionId: getSequentialNextQuestionId(currentQuestionIndex),
					reason: null,
					roles: [],
					notifyLogs: true,
				};

			if (selectedOptionCount > 1 && currentQuestion.multiSelectNextQuestionId)
				return {
					nextQuestionId: resolveNextQuestionId(currentQuestion.multiSelectNextQuestionId, currentQuestionIndex),
					reason: currentQuestion.multiSelectReason || null,
					roles: [],
					notifyLogs: currentQuestion.multiSelectNotifyLogs !== false,
				};

			// If Other was selected and question has otherNextQuestionId
			if (otherSelected && currentQuestion.otherNextQuestionId)
				return {
					nextQuestionId: resolveNextQuestionId(currentQuestion.otherNextQuestionId, currentQuestionIndex),
					reason: currentQuestion.otherReason || null,
					roles: Array.isArray(currentQuestion.otherRoles) ? currentQuestion.otherRoles : [],
					notifyLogs: currentQuestion.otherNotifyLogs !== false,
				};

			// If MCQ with a selected option and that option has a nextQuestionId
			if (selectedOptionIndex !== null && currentQuestion.mcq && currentQuestion.mcq.length > 0) {
				const selectedOption = currentQuestion.mcq[selectedOptionIndex];

				if (selectedOption?.nextQuestionId) {
					const reason = selectedOption.reason || selectedOption.branch?.reason || null;
					return {
						nextQuestionId: resolveNextQuestionId(selectedOption.nextQuestionId, currentQuestionIndex),
						reason,
						roles: Array.isArray(selectedOption.roles) ? selectedOption.roles : [],
						notifyLogs: selectedOption.notifyLogs !== false,
					};
				}
			}

			// Check regex branches
			if (currentQuestion.regexBranches && currentQuestion.regexBranches.length > 0) {
				for (const branch of currentQuestion.regexBranches) {
					if (branch.pattern) {
						try {
							const regex = new RegExp(branch.pattern, "i"); // case-insensitive

							if (regex.test(answerText)) {
								const reason = branch.reason || null;
								const roles = Array.isArray(branch.roles) ? branch.roles : [];
								if (branch.nextQuestionId)
									return {
										nextQuestionId: resolveNextQuestionId(branch.nextQuestionId, currentQuestionIndex),
										reason,
										roles,
										notifyLogs: branch.notifyLogs !== false,
									};

								return {
									nextQuestionId: getSequentialNextQuestionId(currentQuestionIndex),
									reason,
									roles,
									notifyLogs: true,
								};
							}
						} catch (error) {
							console.error(`Invalid regex pattern "${branch.pattern}":`, error);
						}
					}
				}
			}

			// Default, use nextQuestionId, otherwise just follow order.
			if (Object.hasOwn(currentQuestion, "nextQuestionId") && currentQuestion.nextQuestionId !== null)
				return {
					nextQuestionId: resolveNextQuestionId(currentQuestion.nextQuestionId, currentQuestionIndex),
					reason: currentQuestion.reason || null,
					roles: [],
					notifyLogs: true,
				};

			return {
				nextQuestionId: getSequentialNextQuestionId(currentQuestionIndex),
				reason: null,
				roles: [],
				notifyLogs: true,
			};
		}

		function createQuestionEmbed(question, responselength) {
			const safeTruncate = (str) => (str.length > 1024 ? `${str.slice(0, 1024 - 3)}...` : str);

			const DMEmbed = new EmbedBuilder()
				.setColor("#3f7ff1")
				.setFooter({ text: 'Click "cancel" to cancel the application.' });

			let actionRow = new ActionRowBuilder();
			const hasMcq = question.mcq && question.mcq.length > 0;
			if (hasMcq) {
				const isMultiSelect = question.maxSelections > 1 || question.allowMultipleSelections === true;
				const hasOther = Boolean(question.allowOther);
				const optionsCount = question.mcq.length;
				const useSelectMenu = isMultiSelect || hasOther || optionsCount > 5;

				if (!useSelectMenu) {
					question.mcq.forEach((_option, index) => {
						const buttonIndex = index + 1;

						actionRow.addComponents(
							new ButtonBuilder()
								.setCustomId(buttonIndex.toString())
								.setLabel(buttonIndex.toString())
								.setStyle("Primary"),
						);
					});

					const mcqWithEmojis = question.mcq
						.map((option, index) => `${numberToEmoji[index] || `[${index + 1}]`} ${option?.label ?? option}`)
						.join("\n ");

					DMEmbed.addFields({
						name: `Question \`${responselength + 1}\``,
						value: safeTruncate(`${question.content}\n\n${mcqWithEmojis}`),
					});
				} else {
					const options = question.mcq.slice(0, 20).map((option, index) => ({
						label: (option.label || option).toString().slice(0, 100),
						value: (index + 1).toString(),
					}));

					if (hasOther) {
						options.push({
							label: "Other",
							value: "other",
							description: "Specify a custom answer",
						});
					}

					const minValues = Math.max(1, Math.min(question.minSelections || 1, options.length));
					const configuredMax = question.maxSelections || (question.allowMultipleSelections ? options.length : 1);
					const maxValues = Math.max(minValues, Math.min(configuredMax, options.length));

					actionRow.addComponents(
						new StringSelectMenuBuilder()
							.setCustomId("mcq_select")
							.addOptions(options)
							.setPlaceholder("Select an option")
							.setMinValues(minValues)
							.setMaxValues(maxValues),
					);

					DMEmbed.addFields({ name: `Question \`${responselength + 1}\``, value: safeTruncate(`${question.content}`) });
				}
			} else {
				DMEmbed.addFields({ name: `Question \`${responselength + 1}\``, value: safeTruncate(`${question.content}`) });
				actionRow = null;
			}

			return { DMEmbed, actionRow };
		}

		(async () => {
			try {
				const user = await c.users.fetch(userid);
				const dmChannel = await c.channels.fetch(dmChannelId);
				let activeQuestionMessage;
				let awaitingOther = null;

				// Get the first question
				const firstQuestion = botQuestions[0];
				if (!firstQuestion) {
					reject(new Error("No questions found in application"));
					return;
				}

				const restoredResponses = Array.isArray(resumeState?.responses) ? resumeState.responses : [];
				const restoredQuestionId = resumeState?.currentQuestionId;
				const startingQuestion = (restoredQuestionId && questionMap.get(restoredQuestionId)) || firstQuestion;
				const responses = restoredResponses;
				let processingQueue = Promise.resolve();
				let currentQuestionId = startingQuestion.id;
				let currentQuestionIndex = questionIndexMap.get(startingQuestion.id) ?? 0;

				if (resumeState?.currentQuestionId && resumeState?.currentMessageId) {
					activeQuestionMessage = await dmChannel.messages.fetch(resumeState.currentMessageId).catch(() => null);
					const continueEmbed = new EmbedBuilder()
						.setDescription(
							"Melpo has been restarted to update it's system.\nTo ensure no interruptions, I'm resuming your application from where you left off.\nPlease continue by answering the last asked question.",
						)
						.setColor("#3f7ff1");

					await dmChannel.send({ embeds: [continueEmbed] });
				}

				// if no activeQuestionMessage message, send question again.
				if (!activeQuestionMessage) {
					const { DMEmbed, actionRow } = createQuestionEmbed(startingQuestion, responses.length);
					activeQuestionMessage = await dmChannel.send({
						content: resumeState?.currentQuestionId
							? "Resuming your previous application from where you left off."
							: undefined,
						embeds: [DMEmbed],
						components: [actionRow, cancelbutton].filter(Boolean),
					});
				}

				await saveProgress(
					responses,
					currentQuestionId,
					currentQuestionIndex,
					activeQuestionMessage.id,
					startingQuestion,
					false,
				);

				const collector = dmChannel.createMessageCollector({ filter: (m) => !m.author.bot, time: 3600000 });
				const buttoncollector = dmChannel.createMessageComponentCollector({
					filter: (i) => i.user.id === user.id,
					time: 3600000,
				});

				let actionReason = null;
				let actionRoles = [];
				let shouldNotifyLogs = true;

				async function submitAnswerAndAdvance(
					currentQuestion,
					inputData,
					nextQuestionId,
					branchReason = null,
					branchRoles = [],
					branchNotifyLogs = true,
				) {
					responses.push({
						questionId: currentQuestion.id,
						questionContent: currentQuestion.content,
						content: inputData.content,
						...(inputData.mcqIndex && { mcqIndex: inputData.mcqIndex }),
						...(inputData.attachments && { attachments: inputData.attachments }),
						...(inputData.otherSelected && { otherSelected: true }),
					});

					collector.resetTimer();
					buttoncollector.resetTimer();

					// Check if it reached the end
					if (
						nextQuestionId === null ||
						nextQuestionId === "end" ||
						nextQuestionId === "kick" ||
						nextQuestionId === "deny" ||
						nextQuestionId === "verify"
					) {
						actionReason = branchReason;
						actionRoles = branchRoles || [];
						shouldNotifyLogs = branchNotifyLogs !== false;
						await clearProgress();
						const stopReason = nextQuestionId === "end" || nextQuestionId === null ? "completed" : nextQuestionId;
						buttoncollector.stop(stopReason);
						collector.stop(stopReason);

						return;
					}

					// Get the next question
					const nextQuestion = questionMap.get(nextQuestionId);
					if (!nextQuestion) {
						console.error(`Next question with ID ${nextQuestionId} not found`);
						buttoncollector.stop("completed");
						collector.stop("completed");
						return;
					}

					currentQuestionId = nextQuestionId;
					currentQuestionIndex = questionIndexMap.get(nextQuestionId) ?? currentQuestionIndex + 1;

					const { DMEmbed, actionRow } = createQuestionEmbed(nextQuestion, responses.length);
					activeQuestionMessage = await dmChannel.send({
						embeds: [DMEmbed],
						components: [actionRow, cancelbutton].filter(Boolean),
					});

					await saveProgress(
						responses,
						currentQuestionId,
						currentQuestionIndex,
						activeQuestionMessage.id,
						nextQuestion,
						false,
					);
				}

				// Handle button interactions
				buttoncollector.on("collect", async (i) => {
					processingQueue = processingQueue
						.then(async () => {
							try {
								if (buttoncollector.ended || collector.ended) return;
								if (i.message.id !== activeQuestionMessage?.id) return;

								await i.deferUpdate().catch(() => console.error("Failed to defer update for cancel button"));

								// handle cancel button
								if (i.customId.startsWith("cancelverification-")) {
									collector.stop("canceled");
									buttoncollector.stop("canceled");
									const cancelEmbed = new EmbedBuilder()
										.setTitle("Application Canceled")
										.setDescription(
											`The application has been canceled. Feel free to restart the application just like you did before!`,
										)
										.setColor("#ff0000");

									await activeQuestionMessage
										.edit({
											embeds: [cancelEmbed],
											components: [],
										})
										.catch(() => {});

									await clearProgress().catch((err) => {
										console.error("Failed to clear progress on cancel:", err);
									});
									reject(new Error("Application was canceled"));
									return;
								}

								// Handle MCQ interactions
								if (!i.customId.includes("cancel")) {
									const currentQuestion = questionMap.get(currentQuestionId);

									if (!currentQuestion) {
										console.error(`Question with ID ${currentQuestionId} not found`);
										return;
									}

									if (!currentQuestion.mcq || currentQuestion.mcq.length === 0) {
										console.error(`Invalid MCQ question at index ${currentQuestionId}`);
										return;
									}

									let selectedOptionIndex = null;
									let selectedOptions = [];
									let fieldValue = "";

									if (i.isButton()) {
										selectedOptionIndex = parseInt(i.customId, 10) - 1;
										if (selectedOptionIndex < 0 || selectedOptionIndex >= currentQuestion.mcq.length) {
											console.error(`Invalid answer index ${selectedOptionIndex} for question ${currentQuestionId}`);
											return;
										}

										const mcqanswer =
											currentQuestion.mcq[selectedOptionIndex]?.label ?? currentQuestion.mcq[selectedOptionIndex];
										fieldValue = `${numberToEmoji[selectedOptionIndex] || `[${selectedOptionIndex + 1}]`} ${mcqanswer}`;
									} else if (i.isStringSelectMenu()) {
										const isOtherSelected = i.values.includes("other");
										const selectedIndexes = i.values
											.filter((value) => value !== "other")
											.map((value) => parseInt(value, 10) - 1);

										selectedOptions = selectedIndexes
											.map((index) => {
												if (index < 0 || index >= currentQuestion.mcq.length) {
													console.error(`Invalid answer index ${index} for question ${currentQuestionId}`);
													return null;
												}

												return { index: index, option: currentQuestion.mcq[index] };
											})
											.filter((item) => item !== null);

										if (isOtherSelected) {
											awaitingOther = {
												questionId: currentQuestion.id,
												normalSelected: selectedOptions,
											};

											// Remove select menu so applicant cannot change selection while typing custom text
											await activeQuestionMessage
												.edit({
													components: [cancelbutton].filter(Boolean),
												})
												.catch(() => {});

											await dmChannel.send({
												content: "Please type your custom response for **Other** in this chat:",
											});
											return;
										}

										fieldValue = selectedOptions
											.map(
												(option) =>
													`${numberToEmoji[option.index] || `[${option.index + 1}]`} ${option.option?.label ?? option.option}`,
											)
											.join("\n ");
										if (selectedOptions.length > 0) selectedOptionIndex = selectedOptions[0].index;
									}

									const questionLength = currentQuestion.content.length;
									let answercontent = fieldValue;

									// Truncate if too long
									if (answercontent.length > 1024 - questionLength) {
										answercontent = String(answercontent.substring(0, 1020 - questionLength)).concat("...");
									}

									// Determine next question based on branching
									const branchResult = getNextQuestionId(
										currentQuestion,
										currentQuestionIndex,
										isPremium,
										selectedOptionIndex,
										fieldValue,
										i.isStringSelectMenu() ? selectedOptions.length : 1,
									);
									const nextQuestionId =
										typeof branchResult === "object" && branchResult !== null
											? branchResult.nextQuestionId
											: branchResult;
									const branchReason =
										typeof branchResult === "object" && branchResult !== null ? branchResult.reason : null;
									const branchRoles =
										typeof branchResult === "object" && branchResult !== null ? branchResult.roles || [] : [];
									const branchNotifyLogs =
										typeof branchResult === "object" && branchResult !== null
											? branchResult.notifyLogs !== false
											: true;

									const isWrongAnswer = nextQuestionId === "deny" || nextQuestionId === "kick";
									const answerEmbed = new EmbedBuilder(activeQuestionMessage.embeds[0])
										.setColor(isWrongAnswer ? "#eb2121" : "#008000")
										.addFields({ name: `Answer`, value: answercontent });

									await activeQuestionMessage.edit({ embeds: [answerEmbed], components: [] });

									await submitAnswerAndAdvance(
										currentQuestion,
										{
											content: fieldValue,
											mcqIndex:
												selectedOptions.length > 0
													? selectedOptions.map((option) => option.index)
													: [selectedOptionIndex],
										},
										nextQuestionId,
										branchReason,
										branchRoles,
										branchNotifyLogs,
									);
								}
							} catch (error) {
								console.error(`Error in MCQ handler for user ${userid}:`, error);

								try {
									await dmChannel.send("An error occurred. Please try again or contact support.");
								} catch (dmError) {
									console.error("Failed to send error message:", dmError);
								}

								collector.stop("error");
								buttoncollector.stop("error");
								reject(error);
							}
						})
						.catch((error) => {
							console.error(`Unhandled processing error for user ${userid}:`, error);
							collector.stop("error");
							buttoncollector.stop("error");
							reject(error);
						});
				});

				// Handle text messages
				collector.on("collect", async (collected) => {
					processingQueue = processingQueue
						.then(async () => {
							try {
								if (buttoncollector.ended || collector.ended) return;
								if (collected.createdTimestamp < activeQuestionMessage?.createdTimestamp) return;

								const currentQuestion = questionMap.get(currentQuestionId);

								if (!currentQuestion) return;

								const hasMcq = currentQuestion.mcq && currentQuestion.mcq.length > 0;
								if (hasMcq) {
									if (!awaitingOther || awaitingOther.questionId !== currentQuestion.id) {
										return;
									}
								}

								if (imageSubmission === false && collected.attachments?.size > 0) {
									await collected.author
										.send("Images are not allowed. Please submit your answer with text only.")
										.catch(() => {});
									return;
								}

								let totalcontent = collected.content;
								let answercontent = collected.content;
								let mcqIndices = [];
								let selectedOptionIndex = null;
								let selectedCount = 1;

								let otherSelected = false;
								if (hasMcq && awaitingOther) {
									otherSelected = true;
									const customText = collected.content.trim() || "No custom response provided";
									const normalLines = awaitingOther.normalSelected.map(
										(opt) => `${numberToEmoji[opt.index] || `[${opt.index + 1}]`} ${opt.option?.label ?? opt.option}`,
									);
									const otherLine = `Other: ${customText}`;
									const combinedLines = [...normalLines, otherLine];

									answercontent = combinedLines.join("\n ");
									totalcontent = answercontent;
									mcqIndices = awaitingOther.normalSelected.map((opt) => opt.index);
									selectedOptionIndex = mcqIndices.length > 0 ? mcqIndices[0] : null;
									selectedCount = awaitingOther.normalSelected.length + 1;
									awaitingOther = null;
								} else {
									if (totalcontent.length < 1 && collected.attachments.size === 0) {
										totalcontent = "No answer provided";
										answercontent = "No answer provided";
									}
								}

								const questionLength = currentQuestion.content.length;

								// Truncate if too long
								if (answercontent.length > 1024 - questionLength) {
									answercontent = String(answercontent.substring(0, 1020 - questionLength)).concat("...");
									await collected.author.send("Note: Your answer was shortened to fit Discord's limits.");
								}

								// Determine next question based on regex branching or default
								const branchResult = getNextQuestionId(
									currentQuestion,
									currentQuestionIndex,
									isPremium,
									selectedOptionIndex,
									answercontent,
									selectedCount,
									otherSelected,
								);
								const nextQuestionId =
									typeof branchResult === "object" && branchResult !== null
										? branchResult.nextQuestionId
										: branchResult;
								const branchReason =
									typeof branchResult === "object" && branchResult !== null ? branchResult.reason : null;
								const branchRoles =
									typeof branchResult === "object" && branchResult !== null ? branchResult.roles || [] : [];
								const branchNotifyLogs =
									typeof branchResult === "object" && branchResult !== null ? branchResult.notifyLogs !== false : true;

								const isWrongAnswer = nextQuestionId === "deny" || nextQuestionId === "kick";
								const answerEmbed = new EmbedBuilder(activeQuestionMessage.embeds[0])
									.setColor(isWrongAnswer ? "#eb2121" : "#008000")
									.addFields({ name: `Answer`, value: answercontent });

								await activeQuestionMessage.edit({ embeds: [answerEmbed], components: [] });

								await submitAnswerAndAdvance(
									currentQuestion,
									{
										content: totalcontent,
										...(mcqIndices.length > 0 && { mcqIndex: mcqIndices }),
										...(otherSelected && { otherSelected: true }),
										attachments: collected.attachments?.map((attachment) => attachment.url),
									},
									nextQuestionId,
									branchReason,
									branchRoles,
									branchNotifyLogs,
								);
							} catch (error) {
								console.error(`Error handling text message for user ${userid}:`, error);
								await collected.author
									.send("An error occurred processing your answer. Please try again.")
									.catch(() => {});
								collector.stop("error");
								buttoncollector.stop("error");
								reject(error);
							}
						})
						.catch((error) => {
							console.error(`Unhandled text processing error for user ${userid}:`, error);
							collector.stop("error");
							buttoncollector.stop("error");
							reject(error);
						});
				});

				//Biome fix : Marked collected as unused via _
				collector.on("end", async (_collected, reason) => {
					try {
						buttoncollector.stop();

						if (reason === "completed" || reason === "kick" || reason === "deny" || reason === "verify") {
							resolve([reason, responses, sessionStartedAt, actionReason, actionRoles, shouldNotifyLogs]);
						} else if (reason === "canceled") {
							await clearProgress();
							reject(new Error("Application was canceled"));
						} else if (reason === "time") {
							const timeoutEmbed = new EmbedBuilder()
								.setTitle("Application Timed Out")
								.setDescription("The application process has timed out. Please restart the application.")
								.setColor("#ff0000");

							await dmChannel.send({ embeds: [timeoutEmbed] }).catch(() => {});
							await clearProgress();
							reject(new Error("Application timed out"));
						} else if (reason === "error") {
							reject(new Error("Application ended due to an internal error"));
						} else {
							reject(new Error(`Application ended unexpectedly: ${reason}`));
						}
					} catch (error) {
						console.error(`Error in application end handler for user ${userid}:`, error);
						reject(error);
					}
				});
			} catch (error) {
				reject(error);
			}
		})().catch(() => {});
	});
}

async function resumeApplication(client) {
	if (client.cluster && client.cluster.id !== 0) return;

	if (!process.env.ENCRYPTION_KEY) {
		console.error("ENCRYPTION_KEY is not configured!!");
		return;
	}

	const pendingRows = await Submissions.findAll({ where: { status: "pending" }, order: [["updatedAt", "ASC"]] });
	for (const progressRow of pendingRows) {
		try {
			if (activeVerifications.has(progressRow.user_id)) continue;

			const payload = decryptData(progressRow.data, process.env.ENCRYPTION_KEY);
			if (
				!payload ||
				payload.submittedForReview === true ||
				!payload.currentQuestionId ||
				!payload.currentMessageId ||
				!payload.dmChannelId ||
				!Array.isArray(payload.questionObjects) ||
				payload.questionObjects.length === 0
			)
				continue;

			const user = await client.users.fetch(progressRow.user_id).catch(() => null);
			if (!user) continue;

			const { application, error } = await getApplicationByIdWithFallback(progressRow.app_id, progressRow.guild_id);
			if (error || !application) continue;
			const cancelbutton = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`cancelverification-${progressRow.message_id}`)
					.setLabel("Cancel")
					.setStyle("Danger"),
			);

			const dmChannel = await client.channels.fetch(payload.dmChannelId).catch(() => null);
			if (!dmChannel) continue;

			const resumedStartedAt =
				payload.startedAt ?? (progressRow.createdAt ? new Date(progressRow.createdAt).getTime() : null);
			const isPremium = await isPremiumServer(progressRow.guild_id);
			activeVerifications.set(progressRow.user_id, { sessionId: progressRow.message_id, startTime: Date.now() });
			void (async () => {
				try {
					const [reason, responses, sessionStartedAt, actionReason, actionRoles, shouldNotifyLogs = true] =
						await Verificationfunc(client, {
							userid: progressRow.user_id,
							dmChannelId: payload.dmChannelId,
							botQuestions: payload.questionObjects,
							cancelbutton,
							sessionId: progressRow.message_id,
							guildId: progressRow.guild_id,
							configId: progressRow.app_id,
							dbObjectsPath: require.resolve("../dbObjects.js"),
							DBFunctionsPath: require.resolve("../js/DBFunctions.js"),
							encryptionKey: process.env.ENCRYPTION_KEY,
							resumeState: payload,
							isPremium,
							imageSubmission: application.imageSubmission ?? true,
							startedAt: resumedStartedAt,
						});

					if (reason === "completed" || reason === "kick" || reason === "deny" || reason === "verify") {
						if (client.cluster) {
							await client.cluster.broadcastEval(
								async (c, context) => {
									const guild = c.guilds.cache.get(context.guildId);
									if (!guild) return false;

									const targetUser = await c.users.fetch(context.userId).catch(() => null);
									if (!targetUser) return false;

									const { processVerificationResult } = require(context.appHandlerPath);
									const { getApplicationByIdWithFallback } = require(context.tempConfigPath);

									const { application } = await getApplicationByIdWithFallback(context.appId, context.guildId);
									if (!application) return false;

									const verifyLogsChan = application.reviewchannel
										? await guild.channels.fetch(application.reviewchannel).catch(() => null)
										: null;
									const dmChan =
										(await c.channels.fetch(context.dmChannelId).catch(() => null)) ??
										(await targetUser.createDM().catch(() => null));

									const pseudoInteraction = { guild, user: targetUser, channel: verifyLogsChan };

									await processVerificationResult(
										targetUser,
										context.reason,
										context.responses,
										pseudoInteraction,
										context.botQuestions,
										dmChan,
										application.pingrole,
										context.guildId,
										verifyLogsChan,
										application.finishmessage,
										c,
										application.usethreads,
										application.name,
										context.appId,
										context.sessionId,
										application,
										context.sessionStartedAt,
										context.actionReason,
										context.actionRoles,
										context.shouldNotifyLogs,
									);

									return true;
								},
								{
									context: {
										guildId: progressRow.guild_id,
										userId: progressRow.user_id,
										reason,
										responses,
										botQuestions: payload.questionObjects,
										dmChannelId: payload.dmChannelId,
										appId: progressRow.app_id,
										sessionId: progressRow.message_id,
										appHandlerPath: __filename,
										tempConfigPath: require.resolve("./tempconfigfuncs.js"),
										sessionStartedAt,
										actionReason,
										actionRoles,
										shouldNotifyLogs,
									},
								},
							);
						} else {
							const guild = client.guilds.cache.get(progressRow.guild_id);
							if (guild) {
								const { application: latestApp } = await getApplicationByIdWithFallback(
									progressRow.app_id,
									progressRow.guild_id,
								);
								const resolvedApp = latestApp || application;
								if (resolvedApp) {
									const verifyLogsChan = resolvedApp.reviewchannel
										? guild.channels.cache.get(resolvedApp.reviewchannel) ||
											(await guild.channels.fetch(resolvedApp.reviewchannel).catch(() => null))
										: null;
									const dmChan = dmChannel ?? (await user.createDM().catch(() => null));
									const pseudoInteraction = { guild, user, channel: verifyLogsChan };

									await processVerificationResult(
										user,
										reason,
										responses,
										pseudoInteraction,
										payload.questionObjects,
										dmChan,
										resolvedApp.pingrole,
										progressRow.guild_id,
										verifyLogsChan,
										resolvedApp.finishmessage,
										client,
										resolvedApp.usethreads,
										resolvedApp.name,
										progressRow.app_id,
										progressRow.message_id,
										resolvedApp,
										sessionStartedAt,
										actionReason,
										actionRoles,
										shouldNotifyLogs,
									);
								}
							}
						}
					}
				} catch (error) {
					console.error(`Failed to resume application progress ${progressRow.message_id}:`, error);
				} finally {
					activeVerifications.delete(progressRow.user_id);
				}
			})();
		} catch (error) {
			console.error(`Failed to resume application progress ${progressRow.message_id}:`, error);
			activeVerifications.delete(progressRow.user_id);
		}
	}
}

module.exports = { resumeApplication, handleApplicationStart, processVerificationResult };

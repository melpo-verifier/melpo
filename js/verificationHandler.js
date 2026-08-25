const {
	EmbedBuilder,
	MessageFlags,
	ContainerBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	MediaGalleryBuilder,
	SectionBuilder,
	ThumbnailBuilder,
	PermissionsBitField,
	FileBuilder,
	AttachmentBuilder,
	WebhookClient,
} = require("discord.js");
const { Verification, InviteTracker, Submissions, GuildWebhook } = require("../dbObjects.js");
const { resolveImage } = require("./imageUtils.js");
const { decryptData } = require("./DBFunctions.js");
const { Op } = require("sequelize");
const { getSubmission, getLatestSubmissionByUser, isPremiumServer } = require("../js/DBFunctions.js");

function getMessageIds(verification, guildId, applicationId = null) {
	const guildData = verification?.guildVerifications?.[guildId];

	if (!guildData) return [];
	if (Array.isArray(guildData)) return guildData;
	if (applicationId != null) return guildData[applicationId] || [];

	return Object.values(guildData).flat();
}

// !!! unused!!!
async function addMessageId(verification, guildId, applicationId, messageId) {
	if (!verification.guildVerifications) verification.guildVerifications = {};
	let guildData = verification.guildVerifications[guildId];

	if (!guildData || Array.isArray(guildData)) {
		verification.guildVerifications[guildId] = {};
		guildData = verification.guildVerifications[guildId];
	}

	if (!guildData[applicationId]) guildData[applicationId] = [];
	guildData[applicationId].push(messageId);
	verification.changed("guildVerifications", true);
	await verification.save();
}

const VerificationStatus = {
	VERIFIED: "verified", //Verified
	DENIED: "denied", //Denied
	KICKED: "kicked", //Kicked
	LEFT: "left", //Left server
	//Condition for manual verification? - mat (but aren't all verifications manual? - milo)
};

const StatusColors = {
	[VerificationStatus.VERIFIED]: 0x008000,
	[VerificationStatus.DENIED]: 0xeb2121,
	[VerificationStatus.KICKED]: 0xeb2121,
	[VerificationStatus.LEFT]: 0x808080,
	//Condition for manual verification? This would likely fit a yellow caution in most conditions - mat (but aren't all verifications manual? - milo)
};

async function rateLimitedOperation(operation, maxRetries = 3) {
	let retries = 0;

	while (retries < maxRetries) {
		try {
			return await operation();
		} catch (error) {
			if (error.name === "RateLimitError" || error.code === 429) {
				const waitTime = (error.retryAfter || 2000) + retries * 1000;
				console.log(`Rate limited, waiting ${waitTime}ms (attempt ${retries + 1}/${maxRetries})`);
				await new Promise((resolve) => setTimeout(resolve, waitTime));
				retries++;
			} else if (error.code === 10008) {
				throw error;
			} else if (error.code === 50001 || error.code === 50013) {
				throw error;
			} else {
				if (retries === 0) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					retries++;
				} else {
					throw error;
				}
			}
		}
	}

	throw new Error(`Operation failed after ${maxRetries} retries`);
}

// Check if user has permission to manage verifications
async function checkManagerPermission(interaction, application) {
	if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
		const member = await interaction.guild.members.fetch(interaction.user.id);
		const hasManagerRole = application.managerrole.some((role) => member.roles.cache.has(role));

		if (!hasManagerRole) {
			return {
				allowed: false,
				message: `You do not have permission to manage verifications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
			};
		}
	}

	return { allowed: true };
}

// Check if interaction is in the review channel or a thread under it
function isInReviewChannel(interaction, reviewChannelId) {
	if (!reviewChannelId) return true;

	// Direct channel match
	if (interaction.channel.id === reviewChannelId) return true;

	// Check if in a thread under the review channel
	if (interaction.channel.isThread && interaction.channel.parentId === reviewChannelId) return true;

	return false;
}

// !!! NOT USED
// function createDisabledButtons() {
// 	return new ActionRowBuilder().addComponents(
// 		new ButtonBuilder().setCustomId("verify").setLabel("Accept").setStyle("Success").setDisabled(true),
// 		new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle("Danger").setDisabled(true),
// 		new ButtonBuilder().setCustomId("reasondeny").setLabel("Deny with reason").setStyle("Danger").setDisabled(true),
// 		new ButtonBuilder().setCustomId("question").setLabel("Question").setStyle("Primary").setDisabled(true),
// 		new ButtonBuilder().setCustomId("action").setLabel("Kick").setStyle("Secondary").setDisabled(true),
// 	);
// }

// Validate roles exist and bot can manage them
async function validateRoles(interaction, verifiedRoles, unverifiedRoles) {
	const errors = [];
	const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());

	if (verifiedRoles && verifiedRoles.length > 0) {
		for (const roleId of verifiedRoles) {
			let role = interaction.guild.roles.cache.get(roleId);
			if (!role) role = await interaction.guild.roles.fetch(roleId).catch(() => null);

			if (!role) {
				errors.push(
					`Role with ID ${roleId} not found (might have been deleted). Please update your server configuration.`,
				);
				continue;
			}

			if (botMember.roles.highest.comparePositionTo(role) <= 0)
				errors.push(`Cannot assign role ${role.name} because it's higher than or equal to my highest role.`);
		}
	} else {
		errors.push("No verified role set up. Please set up a verified role using the `/setup` command.");
	}

	if (unverifiedRoles && unverifiedRoles.length > 0) {
		for (const roleId of unverifiedRoles) {
			let role = interaction.guild.roles.cache.get(roleId);

			if (!role) role = await interaction.guild.roles.fetch(roleId).catch(() => null);
			if (!role) {
				errors.push(
					`Role with ID ${roleId} not found (might have been deleted). Please update your server configuration.`,
				);
				continue;
			}

			if (role && botMember.roles.highest.comparePositionTo(role) <= 0)
				errors.push(`Cannot remove role ${role.name} because it's higher than or equal to my highest role.`);
		}
	}

	return errors;
}

// Apply roles to user (add verified, remove unverified)
async function applyRoles(user, verifiedRoles, unverifiedRoles, interaction) {
	if (unverifiedRoles && unverifiedRoles.length > 0) {
		for (const roleId of unverifiedRoles) {
			await user.roles.remove(roleId).catch((err) => {
				if (err.code === 10011)
					interaction.channel
						.send(`Unknown role ${roleId} during removal, skipping. Please reconfigure your roles in setup.`)
						.catch(() => {});
				else console.error(`Failed to remove role ${roleId}: ${err.message}`);
			});
		}
	}

	if (verifiedRoles && verifiedRoles.length > 0) {
		for (const roleId of verifiedRoles) {
			await user.roles.add(roleId).catch((err) => {
				if (err.code === 10011)
					interaction.channel
						.send(`Unknown role ${roleId} during addition, skipping. Please reconfigure your roles in setup.`)
						.catch(() => {});
				else console.error(`Failed to add role ${roleId}: ${err.message}`);
			});
		}
	}
}

function createAutoActionContainer(container, status, client, reason = null) {
	const mockInteraction = { isAutoDeny: true, client: client };
	const mockMessage = { components: [container] };

	return handleV2Edit(mockInteraction, mockMessage, status, reason);
}

function handleV2Edit(interaction, message, status, reason = null, memberId = null) {
	const MAX_DISPLAYABLE_TEXT = 4000;
	const color = StatusColors[status];

	let footerText;
	let statusSuffix;

	// Handle the text logic based on whether the user left or an interaction occurred
	if (status === VerificationStatus.LEFT) {
		footerText = `-# User left server (${memberId})`;
		statusSuffix = `\n**Status:** \`Left Server\``;
	} else {
		const statusTextMap = {
			[VerificationStatus.VERIFIED]: "Verified",
			[VerificationStatus.DENIED]: "Denied",
			[VerificationStatus.KICKED]: "Kicked",
		};
		const statusText = statusTextMap[status] || "Denied";

		// Assuming interaction is guaranteed here since it's not a 'LEFT' status
		const actorName = interaction.isAutoDeny ? "Melpo (Auto-Action)" : interaction.user.username;
		const actorId = interaction.isAutoDeny ? interaction.client.user.id : interaction.user.id;

		footerText = `-# ${statusText} by ${actorName} (${actorId})`;
		statusSuffix = reason
			? `\n**Status:** \`${statusText} by ${actorName}\`: ${reason}`
			: `\n**Status:** \`${statusText} by ${actorName}\``;
	}

	const reservedChars = footerText.length + 50;
	let totalTextLength = 0;

	const clonedContainer = JSON.parse(JSON.stringify(message.components[0] || {}));
	const editedContainer = new ContainerBuilder({ accent_color: color });

	if (clonedContainer.components) {
		for (const component of clonedContainer.components) {
			if (component.type === 9) {
				let content = component.components[0].content;
				content = content.replace(/<@&\d+>/g, "").trim();

				const fullContent = content + statusSuffix;
				const available = MAX_DISPLAYABLE_TEXT - totalTextLength - reservedChars;
				const truncatedContent =
					available < fullContent.length
						? String(fullContent.slice(0, Math.max(available - 3, 0))).concat("...")
						: fullContent;

				totalTextLength += truncatedContent.length;

				editedContainer.addSectionComponents(
					new SectionBuilder()
						.addTextDisplayComponents(new TextDisplayBuilder({ content: truncatedContent }))
						.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: component.accessory.media.url } })),
				);
			} else if (component.type === 10) {
				const available = MAX_DISPLAYABLE_TEXT - totalTextLength - reservedChars;
				if (available <= 0) continue;

				const content =
					available < component.content.length
						? String(component.content.slice(0, Math.max(available - 3, 0))).concat("...")
						: component.content;

				totalTextLength += content.length;

				editedContainer.addTextDisplayComponents(new TextDisplayBuilder({ content: content }));
			} else if (component.type === 14) {
				editedContainer.addSeparatorComponents(
					new SeparatorBuilder({ spacing: component.spacing || SeparatorSpacingSize.Small }),
				);
			} else if (component.type === 12) {
				if (component.items?.length > 0) {
					const mappedurls = component.items?.map((item) => ({ media: { url: item.media.url } }));
					editedContainer.addMediaGalleryComponents(new MediaGalleryBuilder({ items: mappedurls }));
				}
			} else if (component.type === 13) {
				if (component.file?.url?.startsWith("attachment://"))
					editedContainer.addFileComponents(new FileBuilder().setURL(component.file.url));
			}
		}
	}

	editedContainer.addTextDisplayComponents(new TextDisplayBuilder({ content: footerText }));
	return editedContainer;
}

// Process text placeholders for welcome messages
async function processText(text, user, interaction, verifiedRoles, appName = null) {
	if (!text) return null;

	if (text.toLowerCase().includes("{q") && interaction.message?.flags?.has(MessageFlags.IsComponentsV2)) {
		const regex = /\{q[0-9]\}/gi;
		const matches = text.match(regex);

		if (matches) {
			matches.forEach((match) => {
				const questionNumber = parseInt(match.slice(2, -1), 10);
				const component = interaction.message.components[0]?.components?.find((c) =>
					c.data?.content?.startsWith(`**${questionNumber}.**`),
				);

				//if (component && component.content) {
				if (component?.content) {
					const answer = component.content.split("_ _")[1]?.trim() || "";
					text = text.replace(new RegExp(match, "gi"), answer);
				} else {
					text = text.replace(new RegExp(match, "gi"), "");
				}
			});
		}
	} else if (text.toLowerCase().includes("{q")) {
		text = text.replace(/{q[0-9]}/gi, "");
	}

	// Replace user placeholders
	text = text.replace(/{username}/gi, user.user.globalName ?? user.user.username);
	text = text.replace(/{usermention}/gi, `<@${user.id}>`);
	text = text.replace(/{members}/gi, interaction.guild.memberCount);

	// Count verified members
	if (text.toLowerCase().includes("{verifiedmembers}")) {
		const verifiedMembers = await interaction.guild.members
			.fetch()
			.then((members) => {
				return members.filter((member) => verifiedRoles.some((role) => member.roles.cache.has(role))).size;
			})
			.catch((error) => {
				console.error(error);
				return 0;
			});
		text = text.replace(/{verifiedmembers}/gi, verifiedMembers);
	}

	text = text.replace(/{modname}/gi, interaction.user.globalName ?? interaction.user.username);
	text = text.replace(/\${interaction.guild.name}/gi, interaction.guild.name);
	text = text.replace(/{appName}/gi, appName);

	return text?.trim() ? text : null;
}

// Get mentions from content for pinging
function getMentions(content) {
	if (!content) return "";
	const userMentions = content.match(/<@!?(\d+)>/g) || [];
	const roleMentions = content.match(/<@&(\d+)>/g) || [];
	const uniqueUserMentions = new Set(userMentions);
	const uniqueRoleMentions = new Set(roleMentions);
	return `${Array.from(uniqueUserMentions).join(" ")} ${Array.from(uniqueRoleMentions).join(" ")}`.trim();
}

// Send welcome message to channel
async function sendWelcomeMessage(interaction, user, welcomeChannel, welcomeMessage, verifiedRoles, application) {
	if (!welcomeChannel || !welcomeMessage) return;

	const channel = interaction.guild.channels.cache.get(welcomeChannel);
	if (!channel) throw new Error(`Welcome channel ${welcomeChannel} not found`);

	if (welcomeMessage.text) {
		const finalText = await processText(welcomeMessage.text, user, interaction, verifiedRoles);
		const textImage = resolveImage(welcomeMessage.image);
		const finalmessage = { content: finalText };

		if (textImage.embedUrl) finalmessage.embeds = [new EmbedBuilder().setImage(textImage.embedUrl)];
		await channel.send(finalmessage);
	} else {
		const finalTitle = welcomeMessage.title
			? await processText(welcomeMessage.title, user, interaction, verifiedRoles)
			: null;
		const finalDescription = welcomeMessage.description
			? await processText(welcomeMessage.description, user, interaction, verifiedRoles)
			: null;
		const messageContent = getMentions(finalDescription);

		const imageAsset = resolveImage(welcomeMessage.image);

		const welcomeEmbed = new EmbedBuilder()
			.setTitle(finalTitle?.trim() ? finalTitle.slice(0, 256) : null)
			.setDescription(finalDescription)
			.setColor(welcomeMessage.color ?? "#3f7ff1")
			.setImage(imageAsset.embedUrl);

		if (imageAsset.embedUrl) {
			welcomeEmbed.setAuthor({
				name: user.user.globalName ?? user.user.username,
				iconURL: user.user.displayAvatarURL({ dynamic: true, size: 128 }),
			});
		} else {
			welcomeEmbed.setThumbnail(user.user.displayAvatarURL({ dynamic: true, size: 512 }));
		}

		if (application.branding_enabled === true) {
			const webhook = await GuildWebhook.findOne({ where: { channel_id: channel.id } });
			if (webhook) {
				try {
					const webhookData = decryptData(String(webhook.encrypted_token));
					if (!webhookData?.id || !webhookData.token)
						throw new Error(`Invalid webhook data for channel ${webhook.channel_id}`);

					const client = new WebhookClient({ id: webhookData.id, token: webhookData.token });
					const name = application.custom_name || "Melpo Verifier";
					const avatarURL = application.custom_avatar_url || null;
					await client.send({
						username: name,
						avatarURL: avatarURL,
						content: messageContent || null,
						embeds: [welcomeEmbed],
					});
					return;
				} catch (error) {
					interaction
						.followUp({
							content: `Welcome channel webhook error: ${error.message}`,
							flags: MessageFlags.Ephemeral,
						})
						.catch(() => {});
					console.error("Error sending welcome webhook:", error.message);
				}
			}
		}

		await channel.send({ content: messageContent || null, embeds: [welcomeEmbed] });
	}
}

// Send verification DM to user
async function sendVerifyDM(user, application, interaction, verifiedRoles) {
	if (!application.verifymessage) return;

	const { title, description, color, image } = application.verifymessage;

	const finalTitle = await processText(title, user, interaction, verifiedRoles, application.name);
	const finalDescription = await processText(description, user, interaction, verifiedRoles, application.name);
	const dmImage = resolveImage(image);

	const finalEmbed = new EmbedBuilder()
		.setTitle(finalTitle?.trim() ? finalTitle.slice(0, 256) : null)
		.setDescription(finalDescription)
		.setColor(color ?? null)
		.setImage(dmImage.embedUrl);

	try {
		await user.send({ embeds: [finalEmbed] });
		return { success: true };
	} catch (error) {
		if (error.code === 50007 || error.code === 50278) return { success: false, dmDisabled: true };
		throw error;
	}
}

// Send denial DM to user
async function sendDenyDM(modname, user, application, guildName, reason = null) {
	const description = application.denymessage?.description
		? application.denymessage.description
				.replace(/{modname}/gi, modname)
				.replace(/\${interaction.guild.name}/gi, guildName)
				.replace(/{appName}/gi, application.name)
		: `Your application into **${guildName}** has been denied.`;

	const dmImage = resolveImage(application.denymessage.image);

	const denyEmbed = new EmbedBuilder()
		.setColor(application.denymessage?.color || "#EB2121")
		.setTitle(application.denymessage?.title?.slice(0, 256) || "Application Denied")
		.setDescription(`${description}${reason ? `\n**Reason:** ${reason}` : ""}`)
		.setImage(dmImage.embedUrl);

	try {
		await user.send({ embeds: [denyEmbed] });
		return { success: true };
	} catch (error) {
		if (error.code === 50007 || error.code === 50278) return { success: false, dmDisabled: true };
		throw error;
	}
}

// Send kick DM to user
async function sendKickDM(user, guildName, reason = null) {
	const kickEmbed = new EmbedBuilder()
		.setColor("#EB2121")
		.setTitle(`Kicked from ${guildName}`)
		.setDescription(`You've been kicked from ${guildName}${reason ? `\n**Reason:** ${reason}` : ""}`);

	try {
		await user.send({ embeds: [kickEmbed] });
		return { success: true };
	} catch (error) {
		if (error.code === 50007 || error.code === 50278) return { success: false, dmDisabled: true };
		throw error;
	}
}

// Create thread summary embed from thread messages
async function createThreadSummary(thread, client, status) {
	const color = StatusColors[status];
	const threadEmbed = new EmbedBuilder().setTitle("Thread Summary").setColor(color);

	try {
		const threadMessages = await thread.messages.fetch();

		if (threadMessages.size > 1) {
			const messagesArray = Array.from(threadMessages.values())
				.sort((a, b) => a.createdTimestamp - b.createdTimestamp)
				.slice(1);

			const formattedMessages = messagesArray.map((msg) => {
				let content;

				if (msg.flags?.has(MessageFlags.IsComponentsV2))
					content = msg.components?.[0]?.components?.[0]?.content || "No content";
				else content = msg.content || "No content";

				if (msg.author.id === client.user.id) content = content.replace(/### Question answered by[^\n]*\n?/g, "\n");
				return `\`${msg.author.username}:\` ${content}`;
			});

			const finalContent = formattedMessages.join("\n").slice(0, 4096);
			threadEmbed.setDescription(finalContent || "No messages in thread");
		} else {
			threadEmbed.setDescription("No additional messages in thread");
		}
	} catch (error) {
		console.error("Error fetching thread messages:", error);
		threadEmbed.setDescription("Error loading thread messages");
	}

	return threadEmbed;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWebhookClientForChannel(application, channelId) {
	if (!application.branding_enabled) return null;

	const webhookRecord = await GuildWebhook.findOne({ where: { channel_id: channelId } });
	if (!webhookRecord) return null;

	try {
		const webhookData = decryptData(String(webhookRecord.encrypted_token));
		return new WebhookClient({ id: webhookData.id, token: webhookData.token });
	} catch (e) {
		console.error("Failed to decrypt webhook token:", e);
		return null;
	}
}

async function resolveMessage(channel, messageId, cache) {
	if (cache.has(messageId)) return cache.get(messageId);

	const fetchOp = async () => channel.messages.fetch(messageId);
	try {
		const message = await rateLimitedOperation(fetchOp);
		await wait(300);
		return message;
	} catch (error) {
		if (error.code !== 10008) console.error(`Error fetching message ${messageId}:`, error);
		return null;
	}
}

function buildV2ContainerForResend(sourceMessage, interaction, status, reason, userId) {
	const { container, files } = relinkAttachments(sourceMessage);
	const tempMsg = { ...sourceMessage, components: [container] };
	const editedContainer = handleV2Edit(interaction, tempMsg, status, reason, userId);
	return { editedContainer, files };
}

async function processLogMessages({
	interaction = null,
	client,
	application,
	messageids,
	user,
	status,
	reason = null,
}) {
	if (!messageids || messageids.length === 0) return;

	const guild = interaction ? interaction.guild : user.guild;
	const reviewChannel = guild.channels.cache.get(application.reviewchannel);
	if (!reviewChannel) return;

	const hasSeparateLogChannel = Boolean(application.verifylogs) && application.reviewchannel !== application.verifylogs;

	const newestId = messageids[messageids.length - 1];
	const beforeId = newestId ? (BigInt(newestId) + 1n).toString() : undefined;
	const fetchedMessages = await reviewChannel.messages.fetch({ limit: 100, before: beforeId });

	if (hasSeparateLogChannel) {
		const logChannel = guild.channels.cache.get(application.verifylogs);
		if (!logChannel) return;

		if (interaction) {
			const botMember = guild.members.me ?? (await logChannel.guild.members.fetchMe());
			const botPermissions = logChannel.permissionsFor(botMember);

			if (!botPermissions?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel])) {
				return await interaction.channel.send({
					content: `<@${user.id}>, I don't have permissions to send messages in the verification review channel!`,
				});
			}
		}

		// Only the verify flow ever sends branded/webhook messages.
		const webhookClient = interaction ? await getWebhookClientForChannel(application, logChannel.id) : null;
		const threadName = `${user.user?.username || (interaction ? user.username : user.id)}'s log`;

		const sendCopyForMessage = async (message) => {
			if (!message.flags?.has(MessageFlags.IsComponentsV2)) return;

			const { editedContainer, files } = buildV2ContainerForResend(message, interaction, status, reason, user.id);
			const sendPayload = { flags: [MessageFlags.IsComponentsV2], components: [editedContainer] };
			if (files) sendPayload.files = files;

			let threadEmbed;
			if (message.thread) threadEmbed = await createThreadSummary(message.thread, client, status);

			let sentMessage;
			if (webhookClient) {
				sentMessage = await webhookClient.send({
					...sendPayload,
					username: application.custom_name || client.user.username,
					avatarURL: application.custom_avatar_url || client.user.displayAvatarURL(),
				});
			} else {
				const sendOp = async () => logChannel.send(sendPayload);
				sentMessage = await rateLimitedOperation(sendOp);
			}

			const messageToThread = webhookClient ? await logChannel.messages.fetch(sentMessage.id) : sentMessage;
			const threadOp = async () => messageToThread.startThread({ name: threadName });
			const threadchannel = await rateLimitedOperation(threadOp);

			if (threadEmbed) {
				const embedOp = async () => threadchannel.send({ embeds: [threadEmbed] });
				await rateLimitedOperation(embedOp);
			}

			const archiveOp = async () => threadchannel.setArchived(true);
			await rateLimitedOperation(archiveOp);

			if (message.thread) {
				const deleteThreadOp = async () => message.thread.delete();
				await rateLimitedOperation(deleteThreadOp).catch(console.error);
			}

			const deleteOp = async () => message.delete();
			await rateLimitedOperation(deleteOp).catch(console.error);
		};

		if (interaction) {
			// Verify flow: resolve every message first, sort them chronologically, then post them all.
			const messages = [];
			for (const messageId of messageids) {
				const message = await resolveMessage(reviewChannel, messageId, fetchedMessages);
				if (message) messages.push(message);
			}
			messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

			for (const message of messages) {
				await wait(600);
				try {
					await sendCopyForMessage(message);
				} catch (error) {
					console.error("Error processing log message:", error);
				}
			}
		} else {
			// Leave flow: resolve and post each message as it's found, in the given order.
			for (const messageId of messageids) {
				await wait(300);
				const message = await resolveMessage(reviewChannel, messageId, fetchedMessages);
				if (!message) continue;

				try {
					await sendCopyForMessage(message);
				} catch (error) {
					console.error("Error processing log message:", error);
				}
			}
		}
	} else {
		// Only the verify flow ever edits via webhook.
		const webhookClient = interaction ? await getWebhookClientForChannel(application, reviewChannel.id) : null;

		for (const messageId of messageids) {
			if (interaction && messageId === interaction.message?.id) continue;

			try {
				// Both flows pause once per iteration before resolving the message; the amount differs.
				await wait(300);

				const foundMessage = await resolveMessage(reviewChannel, messageId, fetchedMessages);
				if (!foundMessage) continue;
				if (!foundMessage.flags?.has(MessageFlags.IsComponentsV2)) continue;

				if (interaction) {
					const editedContainer = handleV2Edit(interaction, foundMessage, status, reason, user.id);
					const payload = { flags: [MessageFlags.IsComponentsV2], components: [editedContainer] };

					if (foundMessage.webhookId && webhookClient) {
						// Webhook-authored messages must be edited via the webhook client.
						await webhookClient.editMessage(foundMessage.id, payload);
					} else {
						const editOp = async () => foundMessage.edit(payload);
						await rateLimitedOperation(editOp);
					}
				} else {
					// Leave flow only touches messages the bot itself posted.
					if (foundMessage.author.id !== client.user.id) continue;

					const { editedContainer, files } = buildV2ContainerForResend(foundMessage, null, status, reason, user.id);
					const editPayload = {
						flags: [MessageFlags.IsComponentsV2],
						components: [editedContainer],
					};
					if (files) editPayload.files = files;

					await foundMessage.edit(editPayload);
					if (foundMessage.thread) await foundMessage.thread.setArchived(true);
				}
			} catch (error) {
				if (error.code === 10008) {
					continue;
				}
				console.error(`Failed to process message with ID ${messageId}: ${error}`);
			}
		}
	}
}

async function processLeaveMessages({ client, member, application, messageIds }) {
	return processLogMessages({
		client,
		application,
		messageids: messageIds,
		user: member,
		status: VerificationStatus.LEFT,
		reason: null,
		interaction: null,
	});
}

// Clean up verification data from database
async function cleanupVerificationData(verification, guildId, memberId, applicationId = null) {
	const guildData = verification?.guildVerifications?.[guildId];
	if (!guildData) return;

	if (applicationId != null && !Array.isArray(guildData)) {
		await Submissions.destroy({
			where: { user_id: memberId, app_id: String(applicationId), status: { [Op.not]: "denied" } },
		}).catch((e) => console.error("Error deleting submission:", e));

		delete guildData[applicationId];
		if (Object.keys(guildData).length === 0) delete verification.guildVerifications[guildId];
	} else {
		delete verification.guildVerifications[guildId];
		//destroy if status isn't "denied"
		await Submissions.destroy({
			where: { user_id: memberId, guild_id: guildId, status: { [Op.not]: "denied" } },
		}).catch((e) => console.error("Error deleting submission:", e));
	}

	verification.changed("guildVerifications", true);
	await verification.save();
}

// Create "no application" embed for users verified/denied without application
function createNoApplicationEmbed(user, interaction, invitetracker, status) {
	const statusText = status === VerificationStatus.VERIFIED ? "VERIFIED" : "DENIED";
	const actionText = status === VerificationStatus.VERIFIED ? "Verified" : "Denied";
	const color = StatusColors[status];

	return new EmbedBuilder()
		.setColor(color)
		.setTitle(`${user.user.displayName} (${statusText})`)
		.setThumbnail(user.displayAvatarURL({ size: 2048, format: "png" }))
		.setDescription(
			`[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.user.username}\` ${user} \n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(user.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`,
		)
		.setFooter({ text: `${actionText} by ${interaction.user.username}` });
}

// Main verification handler
async function verifyUser(interaction, client, application, user) {
	let submissionData;

	if (interaction.isChatInputCommand()) {
		submissionData = await getLatestSubmissionByUser(user.id, application.id);
	} else {
		submissionData = await getSubmission(interaction.message.id);
	}

	const branchRoles = new Set();
	const regexErrors = [];

	if (submissionData && Array.isArray(submissionData.responses) && (await isPremiumServer(interaction.guild.id))) {
		const questionsMap = new Map(application.questions.filter((q) => q?.id).map((q) => [q.id, q]));

		for (const response of submissionData.responses) {
			const question = questionsMap.get(response.questionId);
			if (!question) continue;

			if (response?.mcqIndex?.length > 0) {
				response.mcqIndex.forEach((index) => {
					const selectedOption = question.mcq?.[index];
					if (selectedOption?.roles) selectedOption.roles.forEach((role) => void branchRoles.add(role));
				});
			} else if (question.regexBranches && response.content) {
				for (const regex of question.regexBranches) {
					try {
						const regpattern = new RegExp(regex.pattern, "i");
						if (regpattern.test(response.content)) regex.roles.forEach((role) => void branchRoles.add(role));
					} catch {
						regexErrors.push(`${response.questionId}: ${regex.pattern}`);
					}
				}
			}
		}

		if (regexErrors.length > 0) {
			await interaction.followUp({
				content: `The following regex patterns are invalid and their roles were not applied:\n${regexErrors.join("\n")}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}

	const verifiedRoles = application.verifiedrole;
	const unverifiedRoles = application.unverifiedrole;
	const welcomeMessage = application.verificationwelcomemessage;
	const welcomeChannel = application.verificationwelcomechannel;

	const rolesToApply = [...new Set([...verifiedRoles, ...branchRoles])];

	const roleErrors = await validateRoles(interaction, rolesToApply, unverifiedRoles);
	if (roleErrors.length > 0) {
		return await interaction.followUp({
			content: roleErrors[0],
			flags: MessageFlags.Ephemeral,
		});
	}

	await applyRoles(user, rolesToApply, unverifiedRoles, interaction);

	if (welcomeChannel && welcomeMessage) {
		try {
			await sendWelcomeMessage(interaction, user, welcomeChannel, welcomeMessage, verifiedRoles, application);
		} catch (error) {
			await interaction.followUp({
				content: `Welcome channel error: ${error.message}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}

	const verification = await Verification.findOne({ where: { userId: user.id } });
	const messageids = getMessageIds(verification, interaction.guild.id, application.id);

	if (!messageids || messageids.length === 0) {
		let logChannel;
		if (application.verifylogs && application.reviewchannel !== application.verifylogs) {
			logChannel = interaction.guild.channels.cache.get(application.verifylogs);
		} else if (application.reviewchannel) {
			logChannel = interaction.guild.channels.cache.get(application.reviewchannel);
		} else {
			logchannel = interaction.channel;
		}

		const invitetracker = await InviteTracker.findOne({
			where: { unique_id: `${user.id}_${interaction.guild.id}` },
		});

		const embed = createNoApplicationEmbed(user, interaction, invitetracker, VerificationStatus.VERIFIED);

		await rateLimitedOperation(async () => {
			await logChannel.send({ embeds: [embed] });
		});
	} else {
		try {
			await processLogMessages({
				interaction,
				client,
				application,
				messageids,
				user: user,
				status: VerificationStatus.VERIFIED,
			});
		} catch (logError) {
			if (logError.code === 50001 || logError.code === 50013) {
				console.warn(`Missing permissions for log messages in guild ${interaction.guild.id}`);
				await interaction
					.followUp({
						content: "Warning: Could not process log messages due to missing permissions.",
						flags: MessageFlags.Ephemeral,
					})
					.catch(() => {});
			} else {
				throw logError;
			}
		}
	}

	// If no separate log channel, edit the current message
	if (
		interaction?.message?.flags?.has(MessageFlags.IsComponentsV2) &&
		(!application.verifylogs || application.reviewchannel === application.verifylogs)
	) {
		const { container, files } = relinkAttachments(interaction.message);

		const tempMsg = { ...interaction.message, components: [container] };
		const verifiedContainer = handleV2Edit(interaction, tempMsg, VerificationStatus.VERIFIED);

		const editPayload = {
			flags: [MessageFlags.IsComponentsV2],
			components: [verifiedContainer],
		};
		if (files) editPayload.files = files;
		await interaction.editReply(editPayload);

		if (interaction.message.thread) await interaction.message.thread.setArchived(true);
	}

	// Cleanup verification data
	if (messageids && messageids.length > 0) {
		await cleanupVerificationData(verification, interaction.guild.id, user.id, application.id);
	}

	// Send verification DM
	const dmResult = await sendVerifyDM(user, application, interaction, verifiedRoles);

	if (!interaction.isChatInputCommand()) {
		if (dmResult.dmDisabled) {
			await interaction.followUp({
				content: `✅ User Verified successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.followUp({
				content: `✅ User verified successfully!\n${rolesToApply.length} role(s) applied.`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}

// Main denial handler
async function denyUser(interaction, client, application, user, reason = null) {
	// Get verification data
	const verification = await Verification.findOne({ where: { userId: user.id } });
	const messageids = getMessageIds(verification, interaction.guild.id, String(application.id));

	const rolesToApply = [];

	//check deny count if there exists a threshold, if it meets threshold apply deny role if it exists
	if (application.maxdenials && application.deniedrole?.length > 0 && (await isPremiumServer(interaction.guild.id))) {
		const denyCount = await Submissions.count({
			where: {
				user_id: user.id,
				guild_id: interaction.guild.id,
				app_id: String(application.id),
				status: VerificationStatus.DENIED,
			},
		});

		if (denyCount + 1 >= application.maxdenials) rolesToApply.push(application.deniedrole);
	} else if (application.deniedrole?.length > 0) {
		rolesToApply.push(application.deniedrole);
	}

	if (rolesToApply.length > 0) {
		// Validate roles
		const roleErrors = await validateRoles(interaction, rolesToApply, null);
		if (roleErrors.length > 0) {
			return await interaction.followUp({ content: roleErrors[0], flags: MessageFlags.Ephemeral });
		}

		await applyRoles(user, rolesToApply, null, interaction);
	}

	if (!messageids || messageids.length === 0) {
		let logChannel;
		if (application.verifylogs && application.reviewchannel !== application.verifylogs) {
			logChannel = interaction.guild.channels.cache.get(application.verifylogs);
		} else if (application.reviewchannel) {
			logChannel = interaction.guild.channels.cache.get(application.reviewchannel);
		} else {
			logchannel = interaction.channel;
		}

		const invitetracker = await InviteTracker.findOne({
			where: { unique_id: `${user.id}_${interaction.guild.id}` },
		});

		const embed = createNoApplicationEmbed(user, interaction, invitetracker, VerificationStatus.DENIED);

		await rateLimitedOperation(async () => {
			await logChannel.send({ embeds: [embed] });
		});
	} else {
		// Process log messages
		try {
			await processLogMessages({
				interaction,
				client,
				application,
				messageids,
				user: user,
				status: VerificationStatus.DENIED,
				reason,
			});
		} catch (logError) {
			if (logError.code === 50001 || logError.code === 50013) {
				console.warn(`Missing permissions for log messages in guild ${interaction.guild.id}`);
				await interaction
					.followUp({
						content: "Warning: Could not process log messages due to missing permissions.",
						flags: MessageFlags.Ephemeral,
					})
					.catch(() => {});
			} else {
				throw logError;
			}
		}
	}

	// If no separate log channel, edit the current message
	if (
		interaction?.message?.flags?.has(MessageFlags.IsComponentsV2) &&
		(!application.verifylogs || application.reviewchannel === application.verifylogs)
	) {
		const { container, files } = relinkAttachments(interaction.message);

		const tempMsg = { ...interaction.message, components: [container] };
		const deniedContainer = handleV2Edit(interaction, tempMsg, VerificationStatus.DENIED, reason);
		const editPayload = { flags: [MessageFlags.IsComponentsV2], components: [deniedContainer] };

		if (files) editPayload.files = files;
		await interaction.editReply(editPayload);

		if (interaction.message.thread) await interaction.message.thread.setArchived(true);
	}

	// Cleanup verification data
	if (messageids && messageids.length > 0)
		await cleanupVerificationData(verification, interaction.guild.id, user.id, application.id);

	// Send denial DM
	const dmResult = await sendDenyDM(interaction.user.username, user, application, interaction.guild.name, reason);

	if (!interaction.isChatInputCommand()) {
		//mark submission as denied (only possible on button denial, not command denial)
		await Submissions.update(
			{ status: "denied" },
			{ where: { message_id: interaction.message.id, status: "completed" } },
		).catch((e) => {
			console.error("Error updating submission status:", e);
		});

		if (dmResult.dmDisabled) {
			await interaction.followUp({
				content: `✅ User denied successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.followUp({
				content: `✅ User denied successfully!${rolesToApply.length > 0 ? `\nThe deny role(s) has been applied to the user.` : ""}`,
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}

function relinkAttachments(message) {
	const container = JSON.parse(JSON.stringify(message.components?.[0] || {}));
	const comps = container.components || [];

	const fileComp = comps[comps.length - 1];
	if (!fileComp?.file?.url) return { container, files: null };

	const url = fileComp.file.url;
	const name = fileComp.file.name || url.split("/").pop().split("?")[0];

	if (!url.startsWith("attachment://")) {
		fileComp.file.url = `attachment://${name}`;
		return { container, files: [new AttachmentBuilder(url, { name })] };
	}

	return { container, files: null };
}

module.exports = {
	VerificationStatus,
	StatusColors,
	rateLimitedOperation,
	checkManagerPermission,
	isInReviewChannel,
	validateRoles,
	applyRoles,
	createAutoActionContainer,
	handleV2Edit,
	relinkAttachments,
	processText,
	getMentions,
	getMessageIds,
	addMessageId,
	sendWelcomeMessage,
	sendVerifyDM,
	sendDenyDM,
	sendKickDM,
	createThreadSummary,
	processLogMessages,
	processLeaveMessages,
	cleanupVerificationData,
	createNoApplicationEmbed,
	verifyUser,
	denyUser,
};

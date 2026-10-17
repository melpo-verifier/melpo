const { EmbedBuilder, MessageFlags, WebhookClient, resolveColor } = require("discord.js");
const { GuildWebhook } = require("../dbObjects.js");
const { decryptData } = require("./DBFunctions.js");
const { buildV2Components } = require("./updatePanelsHelpers/v2ComponentBuilder.js");

function safeResolveColor(color, fallback = "#3f7ff1") {
	if (!color) {
		try {
			return resolveColor(fallback);
		} catch {
			return 0x3f7ff1;
		}
	}
	try {
		return resolveColor(color);
	} catch {
		try {
			return resolveColor(fallback);
		} catch {
			return 0x3f7ff1;
		}
	}
}

async function interpolateString(text, context = {}) {
	if (typeof text !== "string" || !text) return text;

	const user = context.user || context.member?.user;
	const member = context.member;
	const guild = context.guild || context.interaction?.guild;
	const interaction = context.interaction;
	const appName = context.appName || context.application?.name || "";
	const modname = context.modname || interaction?.user?.globalName || interaction?.user?.username || "";

	let result = text;

	if (result.toLowerCase().includes("{q")) {
		if (context.answers && typeof context.answers === "object") {
			result = result.replace(/\{q([0-9]+)\}/gi, (_match, qNum) => {
				return context.answers[qNum] ?? context.answers[Number.parseInt(qNum, 10)] ?? "";
			});
		} else if (interaction?.message?.flags?.has(MessageFlags.IsComponentsV2)) {
			const matches = result.match(/\{q[0-9]+\}/gi);
			if (matches) {
				for (const match of matches) {
					const questionNumber = Number.parseInt(match.slice(2, -1), 10);
					const component = interaction.message.components[0]?.components?.find((c) =>
						c.data?.content?.startsWith(`**${questionNumber}.**`),
					);
					if (component?.content) {
						const answer = component.content.split("_ _")[1]?.trim() || "";
						result = result.replace(new RegExp(match, "gi"), answer);
					} else {
						result = result.replace(new RegExp(match, "gi"), "");
					}
				}
			}
		} else {
			result = result.replace(/\{q[0-9]+\}/gi, "");
		}
	}

	if (user) {
		const userObj = user.user || user;
		const userName = userObj.globalName ?? userObj.username ?? user.displayName ?? "";
		result = result.replace(/\{username\}/gi, userName);
		result = result.replace(/\{usermention\}/gi, `<@${user.id}>`);
	} else if (member) {
		const userName = member.user?.globalName ?? member.user?.username ?? member.displayName ?? "";
		result = result.replace(/\{username\}/gi, userName);
		result = result.replace(/\{usermention\}/gi, `<@${member.id}>`);
	}

	const guildName = (typeof guild === "string" ? guild : guild?.name) || "";
	result = result.replace(/\$\{interaction\.guild\.name\}/gi, guildName);
	result = result.replace(/\{guildName\}/gi, guildName);
	result = result.replace(/\{guild\}/gi, guildName);
	result = result.replace(/\{server\}/gi, guildName);
	result = result.replace(/\{serverName\}/gi, guildName);

	if (guild && typeof guild.memberCount === "number") {
		result = result.replace(/\{members\}/gi, String(guild.memberCount));
	}

	if (result.toLowerCase().includes("{verifiedmembers}") && guild && context.verifiedRoles) {
		let verifiedCount = 0;
		try {
			if (typeof guild.members?.fetch === "function") {
				const members = await guild.members.fetch();
				verifiedCount = members.filter((m) => context.verifiedRoles.some((r) => m.roles?.cache?.has(r))).size;
			}
		} catch (err) {
			console.error("Error fetching verified members:", err);
		}
		result = result.replace(/\{verifiedmembers\}/gi, String(verifiedCount));
	}

	result = result.replace(/\{modname\}/gi, modname);
	result = result.replace(/\{appName\}/gi, appName);
	if (context.reason !== undefined && context.reason !== null) {
		result = result.replace(/\{reason\}/gi, String(context.reason));
	}

	if (context.variables && typeof context.variables === "object") {
		for (const [key, val] of Object.entries(context.variables)) {
			result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), String(val));
		}
	}

	return result;
}

async function formatCustomMessage(config, context = {}) {
	if (!config) return null;

	const isV2 = config.format === "v2" || Array.isArray(config.blocks);

	// V2

	if (isV2) {
		const rawBlocks = Array.isArray(config.blocks) ? config.blocks : [];
		const clonedBlocks = JSON.parse(JSON.stringify(rawBlocks));

		let reasonMatched = false;

		async function walkAndInterpolate(block) {
			if (!block || typeof block !== "object") return;

			if (typeof block.content === "string") {
				if (/\{reason\}/i.test(block.content)) reasonMatched = true;
				block.content = await interpolateString(block.content, context);
			}

			if (block.accessory?.label && typeof block.accessory.label === "string") {
				block.accessory.label = await interpolateString(block.accessory.label, context);
			}

			if (Array.isArray(block.buttons)) {
				for (const btn of block.buttons) {
					if (btn.label && typeof btn.label === "string") {
						btn.label = await interpolateString(btn.label, context);
					}
				}
			}

			if (block.placeholder && typeof block.placeholder === "string") {
				block.placeholder = await interpolateString(block.placeholder, context);
			}

			if (Array.isArray(block.options)) {
				for (const opt of block.options) {
					if (opt.label && typeof opt.label === "string") {
						opt.label = await interpolateString(opt.label, context);
					}
					if (opt.description && typeof opt.description === "string") {
						opt.description = await interpolateString(opt.description, context);
					}
				}
			}

			if (block.accentColor) {
				try {
					resolveColor(block.accentColor);
				} catch {
					delete block.accentColor;
				}
			}

			if (Array.isArray(block.blocks)) {
				for (const child of block.blocks) {
					await walkAndInterpolate(child);
				}
			}
		}

		for (const block of clonedBlocks) {
			await walkAndInterpolate(block);
		}

		if (context.reason && !reasonMatched) {
			const reasonBlock = { type: "text", content: `**Reason:** ${context.reason}` };
			const container = clonedBlocks.find((b) => b.type === "container");
			if (container && Array.isArray(container.blocks)) {
				container.blocks.push(reasonBlock);
			} else {
				clonedBlocks.push(reasonBlock);
			}
		}

		const v2PayloadConfig = { ...config, blocks: clonedBlocks };
		const v2Components = buildV2Components(v2PayloadConfig, context.application);

		const result = {
			components: v2Components,
			flags: MessageFlags.IsComponentsV2,
		};

		if (config.content) {
			result.content = await interpolateString(config.content, context);
		}

		return result;
	}

	// EMBED

	if (config.text && !config.title && !config.description) {
		const finalText = await interpolateString(config.text, context);
		const imageUrl = config.imageUrl || (typeof config.image === "string" ? config.image : config.image?.url) || null;
		const payload = { content: finalText };
		if (imageUrl) {
			payload.embeds = [new EmbedBuilder().setImage(imageUrl)];
		}
		return payload;
	}

	const hasExplicitReasonPlaceholder =
		(config.description && /\{reason\}/i.test(config.description)) ||
		(config.title && /\{reason\}/i.test(config.title));

	const title = config.title ? await interpolateString(config.title, context) : null;
	let description = config.description ? await interpolateString(config.description, context) : null;

	if (context.reason && !hasExplicitReasonPlaceholder) {
		description = description ? `${description}\n**Reason:** ${context.reason}` : `**Reason:** ${context.reason}`;
	}

	const rawFooter =
		config.footer?.text || (typeof config.footer === "string" ? config.footer : null) || context.defaultFooter;
	const footerText = rawFooter ? await interpolateString(rawFooter, context) : null;

	const defaultColor = context.defaultColor || "#3f7ff1";
	const colorInt = safeResolveColor(config.color, defaultColor);

	const imageUrl = config.imageUrl || (typeof config.image === "string" ? config.image : config.image?.url) || null;

	const embed = new EmbedBuilder();
	if (title?.trim()) embed.setTitle(title.trim().slice(0, 256));
	if (description) embed.setDescription(description.slice(0, 4096));
	if (colorInt !== null) embed.setColor(colorInt);
	if (imageUrl) embed.setImage(imageUrl);
	if (footerText?.trim()) embed.setFooter({ text: footerText.trim().slice(0, 2048) });

	if (context.author) {
		embed.setAuthor(context.author);
	}
	if (context.thumbnail) {
		embed.setThumbnail(context.thumbnail);
	}

	const payload = { embeds: [embed] };
	if (config.content) {
		payload.content = await interpolateString(config.content, context);
	}

	return payload;
}

async function sendWebhookMessage(channel, application, payload, threadName) {
	let message;
	if (application?.branding_enabled === true) {
		const webhook = await GuildWebhook.findOne({ where: { channel_id: channel.id } });

		if (webhook) {
			try {
				const webhookData = decryptData(String(webhook.encrypted_token));
				if (webhookData?.id && webhookData?.token) {
					const wc = new WebhookClient({ id: webhookData.id, token: webhookData.token });
					try {
						const sendOptions = {
							username: application.custom_name || "Melpo Verifier",
							avatarURL: application.custom_avatar_url || null,
							...payload,
							withComponents: true,
							wait: true,
						};

						if (channel.isThread()) sendOptions.threadId = channel.id;

						message = await wc.send(sendOptions);
					} finally {
						wc.destroy();
					}
				}
			} catch (error) {
				console.error("Branding Webhook Error:", error);
			}
		}
	}

	if (!message) message = await channel.send(payload);

	if (threadName && !channel.isThread()) {
		try {
			await channel.threads.create({
				name: threadName.substring(0, 100),
				startMessage: message.id,
			});
		} catch (error) {
			console.error("Failed to create thread:", error);
		}
	}

	return message;
}

module.exports = {
	sendWebhookMessage,
	formatCustomMessage,
};

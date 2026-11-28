const { MessageFlags, resolveColor } = require("discord.js");

function normalizeEmoji(emoji) {
	if (!emoji) return null;
	if (typeof emoji === "string") return { name: emoji, id: null };
	return {
		name: emoji.name || null,
		id: emoji.id || null,
	};
}

function normalizeColor(color) {
	if (color === undefined || color === null) return null;
	try {
		return resolveColor(color);
	} catch {
		return Number(color) || null;
	}
}

function normalizeComponent(comp) {
	if (!comp) return null;

	const data = typeof comp.toJSON === "function" ? comp.toJSON() : comp.data || comp;
	const type = Number(data.type);

	switch (type) {
		case 1: {
			// ActionRow
			const children = Array.isArray(data.components) ? data.components.map(normalizeComponent).filter(Boolean) : [];
			return { type: 1, components: children };
		}

		case 2: {
			// Button (style, label, custom_id, url, emoji)
			return {
				type: 2,
				style: data.style !== undefined ? Number(data.style) : 2,
				label: data.label ? String(data.label) : null,
				custom_id: data.custom_id || data.customId || null,
				url: data.url || null,
				emoji: normalizeEmoji(data.emoji),
			};
		}

		case 3: {
			// StringSelectMenu (custom_id, placeholder, options: label, value, description, emoji)
			const options = Array.isArray(data.options)
				? data.options.map((opt) => ({
						label: String(opt.label),
						value: String(opt.value),
						description: opt.description ? String(opt.description) : null,
						emoji: normalizeEmoji(opt.emoji),
					}))
				: [];

			return {
				type: 3,
				custom_id: data.custom_id || data.customId || null,
				placeholder: data.placeholder ? String(data.placeholder) : null,
				options,
			};
		}

		case 10: {
			// TextDisplay (content)
			return {
				type: 10,
				content: data.content ? String(data.content) : "",
			};
		}

		case 11: {
			// Thumbnail (media url)
			return {
				type: 11,
				url: data.media?.url || data.url || null,
			};
		}

		case 12: {
			// MediaGallery (items: url)
			const items = Array.isArray(data.items)
				? data.items.map((item) => ({
						url: item.media?.url || item.url || null,
					}))
				: [];

			return { type: 12, items };
		}

		case 14: {
			// Separator (divider defaulted to true)
			return {
				type: 14,
				divider: Boolean(data.divider ?? true),
			};
		}

		case 17: {
			// Container (accent_color, components)
			const children = Array.isArray(data.components) ? data.components.map(normalizeComponent).filter(Boolean) : [];

			return {
				type: 17,
				accent_color: normalizeColor(data.accent_color ?? data.accentColor),
				components: children,
			};
		}

		case 9:
		case 20: {
			// Section (components, accessory)
			const children = Array.isArray(data.components) ? data.components.map(normalizeComponent).filter(Boolean) : [];
			const accessory = data.accessory ? normalizeComponent(data.accessory) : null;

			return {
				type: 9,
				components: children,
				accessory,
			};
		}

		default: {
			return {
				type,
				custom_id: data.custom_id || data.customId || null,
			};
		}
	}
}

function areComponentsEqual(a, b) {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
		return false;
	}

	if (Array.isArray(a) !== Array.isArray(b)) return false;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (!areComponentsEqual(a[i], b[i])) return false;
		}
		return true;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;

	for (const key of keysA) {
		if (!Object.hasOwn(b, key)) return false;
		if (!areComponentsEqual(a[key], b[key])) return false;
	}

	return true;
}

function hasCustomId(components, targetCustomIds) {
	if (!components || !Array.isArray(components)) return false;

	for (const component of components) {
		const customId = component.customId || component.custom_id || component.data?.custom_id;
		if (customId && targetCustomIds.some((target) => customId === target || customId.startsWith(`${target}_`))) {
			return true;
		}

		const children = component.components || component.data?.components;
		if (children && hasCustomId(children, targetCustomIds)) {
			return true;
		}

		const accessory = component.accessory || component.data?.accessory;
		if (accessory && hasCustomId([accessory], targetCustomIds)) {
			return true;
		}
	}

	return false;
}

function messageNeedsUpdate(existingMessage, { isV2, v2Components, embed, row }) {
	const isExistingV2 = Boolean(
		(existingMessage.flags?.bitfield ?? existingMessage.flags) & MessageFlags.IsComponentsV2,
	);

	if (isExistingV2 !== isV2) return true;

	if (isV2) {
		const oldNorm = (existingMessage.components || []).map(normalizeComponent);
		const newNorm = (v2Components || []).map(normalizeComponent);
		return !areComponentsEqual(oldNorm, newNorm);
	}

	// Embed comparison
	const oldEmbed = existingMessage.embeds?.[0];
	const newEmbedData = embed?.data || embed;

	if (!oldEmbed || !newEmbedData) return true;

	const embedTitleChanged = (oldEmbed.title || null) !== (newEmbedData.title || null);
	const embedDescChanged = (oldEmbed.description || null) !== (newEmbedData.description || null);
	const embedImageChanged = (oldEmbed.image?.url || null) !== (newEmbedData.image?.url || null);
	const embedColorChanged =
		normalizeColor(newEmbedData.color) !== (oldEmbed.color != null ? Number(oldEmbed.color) : null);

	if (embedTitleChanged || embedDescChanged || embedImageChanged || embedColorChanged) {
		return true;
	}

	// Compare embed action row components
	const oldRowNorm = (existingMessage.components || []).map(normalizeComponent);
	const newRowNorm = row ? [normalizeComponent(row)] : [];

	return !areComponentsEqual(oldRowNorm, newRowNorm);
}

module.exports = {
	messageNeedsUpdate,
	normalizeComponent,
	normalizeEmoji,
	normalizeColor,
	areComponentsEqual,
	hasCustomId,
};

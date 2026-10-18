const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	ContainerBuilder,
	TextDisplayBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ThumbnailBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	resolveColor,
} = require("discord.js");

const BUTTON_STYLES = {
	primary: ButtonStyle.Primary,
	secondary: ButtonStyle.Secondary,
	success: ButtonStyle.Success,
	danger: ButtonStyle.Danger,
	link: ButtonStyle.Link,
	premium: ButtonStyle.Premium,
};

function resolveButtonStyle(style) {
	if (typeof style === "number") return style;
	if (typeof style === "string") {
		const lower = style.toLowerCase();
		if (BUTTON_STYLES[lower]) return BUTTON_STYLES[lower];
		if (ButtonStyle[style]) return ButtonStyle[style];
	}
	return ButtonStyle.Secondary;
}

function isValidUrl(str) {
	if (!str || typeof str !== "string") return false;
	try {
		const parsed = new URL(str);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function buildV2Button(btn, app) {
	const button = new ButtonBuilder();

	if (btn.label) button.setLabel(String(btn.label).slice(0, 80));
	if (btn.emoji) button.setEmoji(btn.emoji);

	if (btn.action === "link" || btn.style === "link" || btn.url) {
		if (!btn.url || !isValidUrl(btn.url)) return null;
		try {
			button.setStyle(ButtonStyle.Link).setURL(btn.url);
		} catch {
			return null;
		}
	} else {
		button.setStyle(resolveButtonStyle(btn.style));
		const targetAppId = btn.targetApplicationId || app?.id;
		const buttonId = btn.id || btn.customId || "main";
		button.setCustomId(`verifybutton_${targetAppId}_${buttonId}`);
	}

	return button;
}

function buildV2SectionBlock(block, app) {
	const acc = block.accessory;
	if (!acc) return null;

	const section = new SectionBuilder();
	const content = block.content ? String(block.content) : "\u200b";
	section.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

	if (acc.type === "button") {
		const btn = buildV2Button(acc, app);
		if (!btn) return null;
		section.setButtonAccessory(btn);
	} else if (acc.type === "thumbnail" && acc.imageUrl) {
		if (!isValidUrl(acc.imageUrl)) return null;
		try {
			section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: acc.imageUrl } }));
		} catch {
			return null;
		}
	} else {
		return null;
	}

	return section;
}

function processActionRowBlock(rowBlock, app) {
	const rawButtons = rowBlock.buttons || rowBlock.components || [];
	const rows = [];

	for (let i = 0; i < rawButtons.length; i += 5) {
		const chunk = rawButtons.slice(i, i + 5);
		const row = new ActionRowBuilder();
		for (const btn of chunk) {
			const b = buildV2Button(btn, app);
			if (b) row.addComponents(b);
		}
		if (row.components.length > 0) rows.push(row);
	}

	return rows;
}

function buildSelectMenuRow(block, app) {
	const rawOptions = Array.isArray(block.options) ? block.options : [];
	if (rawOptions.length === 0) return null;

	const customId = `verifyselect_${app?.id}${block.id ? `_${block.id}` : ""}`;
	const menu = new StringSelectMenuBuilder().setCustomId(customId);

	if (block.placeholder) menu.setPlaceholder(String(block.placeholder).slice(0, 150));

	const options = [];
	for (const opt of rawOptions) {
		if (!opt.label || opt.value === undefined || opt.value === null) continue;
		const entry = {
			label: String(opt.label).slice(0, 100),
			value: String(opt.value).slice(0, 100),
		};
		if (opt.description) entry.description = String(opt.description).slice(0, 100);
		if (opt.emoji) entry.emoji = opt.emoji;
		options.push(entry);
	}

	if (options.length === 0) return null;

	menu.addOptions(options);
	return new ActionRowBuilder().addComponents(menu);
}

function buildBlock(block, app) {
	switch (block.type) {
		case "text":
			return block.content ? new TextDisplayBuilder().setContent(String(block.content)) : null;

		case "separator": {
			const divider = block.divider !== undefined ? Boolean(block.divider) : true;
			return new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Small);
		}

		case "section":
			return (
				buildV2SectionBlock(block, app) ||
				(block.content ? new TextDisplayBuilder().setContent(String(block.content)) : null)
			);

		case "media":
			if (!block.imageUrl || !isValidUrl(block.imageUrl)) return null;
			try {
				return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(block.imageUrl));
			} catch {
				return null;
			}

		case "action_row":
			return processActionRowBlock(block, app);

		case "select_menu":
			return buildSelectMenuRow(block, app);

		default:
			return null;
	}
}

function appendBlockToContainer(container, block, app) {
	const built = buildBlock(block, app);
	if (!built) return;

	const target = container.components ?? container;
	if (Array.isArray(built)) {
		target.push(...built);
	} else {
		target.push(built);
	}
}

function appendBlockToMessage(components, block, app) {
	const built = buildBlock(block, app);
	if (!built) return;

	if (Array.isArray(built)) {
		components.push(...built);
	} else {
		components.push(built);
	}
}

function buildV2Components(panelConfig, application) {
	const components = [];
	const blocks = Array.isArray(panelConfig.blocks) ? panelConfig.blocks : [];

	for (const block of blocks) {
		if (block.type === "container") {
			const container = new ContainerBuilder();
			if (!block.hideBorder && block.accentColor) {
				if (!block.accentColor) return null;

				const colorInt = resolveColor(block.accentColor);

				if (colorInt !== null) container.setAccentColor(colorInt);
			}

			const childBlocks = Array.isArray(block.blocks) ? block.blocks : [];
			for (const child of childBlocks) {
				appendBlockToContainer(container, child, application);
			}

			components.push(container);
		} else {
			appendBlockToMessage(components, block, application);
		}
	}

	return components;
}

module.exports = {
	buildV2Components,
	buildBlock,
	buildV2Button,
	buildV2SectionBlock,
	buildSelectMenuRow,
	processActionRowBlock,
	appendBlockToContainer,
	appendBlockToMessage,
	resolveButtonStyle,
	BUTTON_STYLES,
};

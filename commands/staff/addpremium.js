const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require("discord.js");
const { PremiumSubscription } = require("../../dbObjects.js");
const { v4: uuidv4 } = require("uuid");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("addpremium")
		.setDescription("Manually add premium subscription to a user")
		.setContexts(0)
		.addStringOption((option) => option.setName("userid").setDescription("Purchaser User ID").setRequired(true))
		.addStringOption((option) =>
			option
				.setName("cycle")
				.setDescription("The billing cycle tier")
				.setRequired(true)
				.addChoices(
					{ name: "Monthly", value: "monthly" },
					{ name: "Yearly", value: "yearly" },
					{ name: "Lifetime", value: "lifetime" },
				),
		)
		.addStringOption((option) =>
			option
				.setName("tier")
				.setDescription("The tier of premium subscription")
				.setRequired(true)
				.addChoices(
					{ name: "Premium x1 (€2,50)", value: "premium_1" },
					{ name: "Premium x3 (€4,50)", value: "premium_3" },
					{ name: "Whitelabel x1 (€5,00)", value: "whitelabel_1" },
					{ name: "Whitelabel x3 (€10,00)", value: "whitelabel_3" },
				),
		)
		.addStringOption((option) =>
			option
				.setName("source")
				.setDescription("The source of the premium subscription")
				.setRequired(true)
				.addChoices({ name: "Gift", value: "GIFT" }, { name: "Ko-Fi", value: "KOFI" }),
		),
	async execute({ client, interaction }) {
		const supportStaffRoleId = process.env.SUPPORTSTAFF_ROLE;
		const member = await interaction.guild.members.fetch(interaction.user.id);

		//check if user has support staff role
		if (!member.roles.cache.has(supportStaffRoleId)) {
			return interaction.reply({
				content: "You are not allowed to use this command!",
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply();

		const purchaserUserId = interaction.options.getString("userid");
		const cycle = interaction.options.getString("cycle");
		const tier = interaction.options.getString("tier");
		const source = interaction.options.getString("source");
		const id = uuidv4();

		console.log(
			`Adding premium subscription for user ${purchaserUserId} with cycle ${cycle}, tier ${tier}, and source ${source}. ID: ${id}. Triggered by user ${interaction.user.id}.`,
		);

		const Embed = new EmbedBuilder()
			.setTitle("Premium Subscription Added")
			.setDescription(`A premium subscription has been manually added.`)
			.addFields(
				{ name: "Purchaser User ID", value: purchaserUserId, inline: true },
				{ name: "Cycle", value: cycle, inline: true },
				{ name: "tier", value: tier, inline: true },
				{ name: "Source", value: source, inline: true },
				{ name: "ID", value: id, inline: true },
				{ name: "Added By", value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
			)
			.setColor(0x00ff00)
			.setTimestamp();

		//send message to logs
		switch (process.env.BUG_REPORT_MODE) {
			case "none":
				break;
			case "user":
				await sendLogDM(Embed, client);
				break;
			case "chan":
				await sendLogChannel(Embed, client);
				break;
			case "both":
				{
					await sendLogDM(Embed, client);
					await sendLogChannel(Embed, client);
				}
				break;
			default:
				console.log("Unknown report mode : %s", process.env.BUG_REPORT_MODE);
				break;
		}

		let expiresAt = new Date();

		if (cycle === "monthly") {
			expiresAt.setMonth(expiresAt.getMonth() + 1);
		} else if (cycle === "yearly") {
			expiresAt.setFullYear(expiresAt.getFullYear() + 1);
		} else if (cycle === "lifetime") {
			expiresAt = new Date(9999, 11, 31);
		}

		try {
			await PremiumSubscription.create({
				id: id,
				purchaser_id: purchaserUserId,
				tier: tier,
				source: source,
				expires_at: expiresAt,
			});
		} catch (error) {
			await interaction.editReply({
				content: `Error adding premium subscription: ${error.message}`,
			});
			return;
		}

		await interaction.editReply({
			content: `Premium subscription added for user ${purchaserUserId} with cycle ${cycle}, tier ${tier}, and source ${source}.`,
		});
	},
};

async function sendLogDM(Embed, client) {
	const user = await client.users.fetch(process.env.BUG_REPORT_USER);
	if (user) {
		await user.send({ embeds: [Embed] });
	} else {
		console.error("Could not find the user to send the log message.");
	}
}

async function sendLogChannel(Embed, client) {
	const channel = await client.channels.fetch(process.env.BUG_REPORT_CHAN);
	if (channel) {
		await channel.send({ embeds: [Embed] });
	} else {
		console.error("Could not find the channel to send the log message.");
	}
}

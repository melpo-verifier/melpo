const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { Blacklist } = require("../../dbObjects.js");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("blacklist")
		.setDescription("Blacklists servers/users from using the bot")
		.setContexts(0)
		.addStringOption((option) => option.setName("server_id").setDescription("Server ID").setRequired(false))
		.addStringOption((option) => option.setName("user_id").setDescription("User ID").setRequired(false))
		.addBooleanOption((option) => option.setName("blacklist").setDescription("Blacklist server/user?"))
		.addStringOption((option) => option.setName("reason").setDescription("Give a reason for blacklist server/user?")),
	async execute({ interaction }) {
		if (interaction.user.id !== "808738877945675786")
			return interaction.reply({
				content: "You are not allowed to use this command.",
				flags: MessageFlags.Ephemeral,
			});

		const serverId = interaction.options.getString("server_id");
		const userId = interaction.options.getString("user_id");
		const blacklist = interaction.options.getBoolean("blacklist");
		const reason = interaction.options.getString("reason");

		if (serverId === null && userId === null) {
			return await interaction.reply({
				content: "Please provide either a server ID or a user ID.",
				flags: MessageFlags.Ephemeral,
			});
		}

		if (blacklist !== null) {
			const [blacklistEntry] = await Blacklist.findOrCreate({
				where: { server_id: serverId, user_id: userId },
			});
			blacklistEntry.blacklisted = blacklist;

			if (reason) {
				blacklistEntry.reason = reason;
			}

			let ownerId = null;
			let guildName = null;

			if (serverId) {
				const results = await interaction.client.cluster.broadcastEval(
					(c, id) => {
						const g = c.guilds.cache.get(id);
						if (g) return { ownerId: g.ownerId, name: g.name };
						return null;
					},
					{ context: serverId },
				);
				const found = results.find((g) => g !== null);
				if (found) {
					ownerId = found.ownerId;
					guildName = found.name;
				}
			}

			if (serverId && !userId) {
				if (ownerId) {
					blacklistEntry.user_id = ownerId;
				}
			}

			await blacklistEntry.save();

			let succesfullLeave = false;

			//leave server and try and send message to owner
			let sendmessage_success = false;
			if (ownerId && guildName) {
				try {
					const owner = await interaction.client.users.fetch(ownerId);
					await owner.send(
						`Your server "${guildName}" has been blacklisted from using Melpo Verifier. Reason: ${reason || "No reason provided"}`,
					);
					sendmessage_success = true;
				} catch (error) {
					console.error(`Could not send message to owner of server for blacklisting ${guildName}:`, error);
				}

				try {
					await interaction.client.cluster.broadcastEval(
						(c, id) => {
							const g = c.guilds.cache.get(id);
							if (g) return g.leave();
						},
						{ context: serverId },
					);
					succesfullLeave = true;
				} catch (error) {
					succesfullLeave = false;
					console.error(`Could not leave blacklisted server ${guildName}:`, error);
				}
			}

			return await interaction.reply({
				content: `Server/user ${serverId || userId} has been ${blacklist ? "blacklisted" : "unblacklisted"} for reason: ${reason || "No reason provided"}\n${sendmessage_success ? "The owner has been notified." : "Could not notify the owner."}\nLeft server: ${succesfullLeave ? "Yes" : "No"}`,
			});
		}
	},
};

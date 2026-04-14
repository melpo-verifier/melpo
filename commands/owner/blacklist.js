const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { Blacklist } = require("../../dbObjects.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklists servers/users from using the bot")
    .setContexts(0)
    .addStringOption((option) =>
      option.setName("server_id").setDescription("Server ID").setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("user_id").setDescription("User ID").setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("blacklist")
        .setDescription("Blacklist server/user?"),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Give a reason for blacklist server/user?"),
    ),
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
      //add server owner to userId
      const guild = interaction.client.guilds.cache.get(serverId);
      if (serverId && !userId) {
        if (guild) {
          blacklistEntry.user_id = guild.ownerId;
        }
      }

      await blacklistEntry.save();

      //leave server and try and send message to owner
      let sendmessage_success = false;
      if (guild) {
          try {
            const owner = await interaction.client.users.fetch(guild.ownerId);
            await owner.send(`Your server "${guild.name}" has been blacklisted from using Melpo Verifier. Reason: ${reason || "No reason provided"}`);
            sendmessage_success = true;
          } catch (error) {
            console.error(`Could not send message to owner of server for blacklisting ${guild.name}:`, error);
          }
        
        await guild.leave();
      }

      return await interaction.reply({
        content: `Server/user ${serverId || userId} has been ${blacklist ? "blacklisted" : "unblacklisted"} for reason: ${reason || "No reason provided"}\n${sendmessage_success ? "The owner has been notified." : "Could not notify the owner."}`,
      });
    }

  },
};

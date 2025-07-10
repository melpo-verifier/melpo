const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} = require("discord.js");
const { ServerConfig } = require("../../dbObjects.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("checkpermissions")
    .setDescription(
      "Check if Melpo has the required permissions to function properly",
    )
    .setContexts(0),
  async execute({ interaction, client }) {
    await interaction.deferReply();
    const botMember = interaction.guild.members.me;
    if (!botMember) {
      await interaction.reply({
        content: "Unable to fetch bot permissions",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const serverConfig = await ServerConfig.findOne({
      where: { server_id: interaction.guild.id },
    });

    const requiredPermissions = [
      { name: "Manage Guild", flag: "ManageGuild" },
      { name: "Manage Roles", flag: "ManageRoles" },
      { name: "Manage Channels", flag: "ManageChannels" },
      { name: "Kick Members", flag: "KickMembers" },
      { name: "Ban Members", flag: "BanMembers" },
      { name: "View Audit Log", flag: "ViewAuditLog" },
      { name: "View Channel", flag: "ViewChannel" },
      { name: "Moderate Members", flag: "ModerateMembers" },
      { name: "Send Messages", flag: "SendMessages" },
      { name: "Send Messages In Threads", flag: "SendMessagesInThreads" },
      { name: "Create Public Threads", flag: "CreatePublicThreads" },
      { name: "Create Private Threads", flag: "CreatePrivateThreads" },
      { name: "Manage Messages", flag: "ManageMessages" },
      { name: "Manage Threads", flag: "ManageThreads" },
      { name: "Embed Links", flag: "EmbedLinks" },
      { name: "Attach Files", flag: "AttachFiles" },
      { name: "Read Message History", flag: "ReadMessageHistory" },
      { name: "Add Reactions", flag: "AddReactions" },
      { name: "Use External Emojis", flag: "UseExternalEmojis" },
      { name: "Send Polls", flag: "SendPolls" },
    ];

    const unneededPermissions = ["Administrator", "ManageWebhooks"];

    let description = "### Required Permissions\n";

    for (const perm of requiredPermissions) {
      try {
        const hasPermission = botMember.permissions.has(
          PermissionsBitField.Flags[perm.name?.replace(/ /g, "")],
        );
        description += `${hasPermission ? "✅" : "❌"} ${perm.name}\n`;
      } catch (error) {
        console.error(`Error checking permission ${perm.name}:`, error);
        description += `❓ ${perm.name}\n`;
      }
    }

    if (botMember.permissions.has(PermissionsBitField.Flags.ViewChannel)) {
      description += "\n### Unneeded (dangerous) Permissions\n";
      try {
        const allPermissionFlags = Object.entries(PermissionsBitField.Flags);
        const dangerousExcessPerms = allPermissionFlags.filter(
          ([name, bit]) => {
            if (!bit) return false;
            const isRequired = requiredPermissions.some(
              (p) => p.name?.replace(/ /g, "") === name,
            );
            return (
              !isRequired &&
              unneededPermissions.includes(name) &&
              botMember.permissions.has(bit)
            );
          },
        );

        if (dangerousExcessPerms.length > 0) {
          dangerousExcessPerms.forEach(([name]) => {
            description += `⚠️ ${name?.replace(/([A-Z])/g, " $1").trim()}\n`;
          });
        } else {
          description += "*Perfect! No unneeded (dangerous) permissions*\n";
        }
      } catch {
        description += "*Unable to check additional permissions*\n";
      }
    }

    description += "\n### Channel-Specific Permissions\n";

    if (serverConfig?.verifychannel) {
      const verifyChannel = interaction.guild.channels.cache.get(
        serverConfig.verifychannel,
      );
      if (verifyChannel) {
        const verifyPerms = verifyChannel.permissionsFor(client.user);
        description += `**Verify Channel (${verifyChannel})**\n`;
        description += `${verifyPerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
        description += `${verifyPerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
        description += `${verifyPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
      }
    }

    if (serverConfig?.reviewchannel) {
      const reviewChannel = interaction.guild.channels.cache.get(
        serverConfig.reviewchannel,
      );
      if (reviewChannel) {
        const reviewPerms = reviewChannel.permissionsFor(client.user);
        description += `\n**Review Channel (${reviewChannel})**\n`;
        description += `${reviewPerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
        description += `${reviewPerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
        description += `${reviewPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
        description += `${reviewPerms.has(PermissionsBitField.Flags.CreatePrivateThreads) ? "✅" : "❌"} Create Private Threads\n`;
        description += `${reviewPerms.has(PermissionsBitField.Flags.SendMessagesInThreads) ? "✅" : "❌"} Send Messages In Threads\n`;
        description += `${reviewPerms.has(PermissionsBitField.Flags.ManageThreads) ? "✅" : "❌"} Manage Threads\n`;
      }
    }

    if (serverConfig?.verifylogs) {
      const logsChannel = interaction.guild.channels.cache.get(
        serverConfig.verifylogs,
      );
      if (logsChannel) {
        const logsPerms = logsChannel.permissionsFor(client.user);
        description += `\n**Verification Logs Channel (${logsChannel})**\n`;
        description += `${logsPerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
        description += `${logsPerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
        description += `${logsPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
        description += `${logsPerms.has(PermissionsBitField.Flags.CreatePrivateThreads) ? "✅" : "❌"} Create Private Threads\n`;
        description += `${logsPerms.has(PermissionsBitField.Flags.SendMessagesInThreads) ? "✅" : "❌"} Send Messages In Threads\n`;
        description += `${logsPerms.has(PermissionsBitField.Flags.ManageThreads) ? "✅" : "❌"} Manage Threads\n`;
      }
    }

    if (serverConfig?.verificationwelcomechannel) {
      const welcomeChannel = interaction.guild.channels.cache.get(
        serverConfig.verificationwelcomechannel,
      );
      if (welcomeChannel) {
        const welcomePerms = welcomeChannel.permissionsFor(client.user);
        description += `\n**Verification Welcome Channel (${welcomeChannel})**\n`;
        description += `${welcomePerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
        description += `${welcomePerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
        description += `${welcomePerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
      }
    }

    description += "\n### Role Hierarchy\n";
    const botRole = interaction.guild.members.me.roles.highest;

    description += `**Bot's Highest Role:** ${botRole} (Position: ${botRole.position})\n`;

    let roleHierarchyIssues = 0;

    if (serverConfig?.verifiedrole && serverConfig.verifiedrole.length > 0) {
      const verifiedRoles = Array.isArray(serverConfig.verifiedrole)
        ? serverConfig.verifiedrole
        : [serverConfig.verifiedrole];
      for (const roleId of verifiedRoles) {
        const verifiedRole = interaction.guild.roles.cache.get(roleId);
        if (verifiedRole) {
          const canManageRole = botRole.position > verifiedRole.position;
          if (!canManageRole) roleHierarchyIssues++;
          description += `**Verified Role:** ${verifiedRole} (Position: ${verifiedRole.position}) ${canManageRole ? "✅" : "❌"}\n`;
        }
      }
    }

    if (
      serverConfig?.unverifiedrole &&
      serverConfig.unverifiedrole.length > 0
    ) {
      const unverifiedRoles = Array.isArray(serverConfig.unverifiedrole)
        ? serverConfig.unverifiedrole
        : [serverConfig.unverifiedrole];
      for (const roleId of unverifiedRoles) {
        const unverifiedRole = interaction.guild.roles.cache.get(roleId);
        if (unverifiedRole) {
          const canManageRole = botRole.position > unverifiedRole.position;
          if (!canManageRole) roleHierarchyIssues++;
          description += `**Unverified Role:** ${unverifiedRole} (Position: ${unverifiedRole.position}) ${canManageRole ? "✅" : "❌"}\n`;
        }
      }
    }

    if (serverConfig?.autorole && serverConfig.autorole.length > 0) {
      const autoRoles = Array.isArray(serverConfig.autorole)
        ? serverConfig.autorole
        : [serverConfig.autorole];
      for (const roleId of autoRoles) {
        const autoRole = interaction.guild.roles.cache.get(roleId);
        if (autoRole) {
          const canManageRole = botRole.position > autoRole.position;
          if (!canManageRole) roleHierarchyIssues++;
          description += `**Auto Role:** ${autoRole} (Position: ${autoRole.position}) ${canManageRole ? "✅" : "❌"}\n`;
        }
      }
    }

    if (serverConfig?.managerrole && serverConfig.managerrole.length > 0) {
      const managerRoles = Array.isArray(serverConfig.managerrole)
        ? serverConfig.managerrole
        : [serverConfig.managerrole];
      for (const roleId of managerRoles) {
        const managerRole = interaction.guild.roles.cache.get(roleId);
        if (managerRole) {
          description += `**Manager Role:** ${managerRole} (Position: ${managerRole.position}) ℹ️\n`;
        }
      }
    }

    description += "\n### TLDR\n";
    const missingPermissions = requiredPermissions.filter((perm) => {
      try {
        return !botMember.permissions.has(
          PermissionsBitField.Flags[perm.name?.replace(/ /g, "")],
        );
      } catch {
        return true;
      }
    });

    if (missingPermissions.length === 0) {
      description += "✅ **All required permissions are present**\n";
    } else {
      description += `❌ **Missing ${missingPermissions.length} required permission(s)**\n`;
    }

    if (roleHierarchyIssues === 0) {
      description += "✅ **Bot can manage all configured roles**\n";
    } else {
      description += `❌ **Cannot manage ${roleHierarchyIssues} role(s) - Move bot role higher**\n`;
    }

    const hasIssues = missingPermissions.length > 0 || roleHierarchyIssues > 0;

    const embed = new EmbedBuilder()
      .setColor(hasIssues ? 0xff0000 : 0x00ff00)
      .setTitle("🔍 Advanced Permission Analysis")
      .setDescription(description)
      .setFooter({
        text: "✅ = Has Permission/Can Manage | ❌ = Missing Permission/Cannot Manage | ⚠️ = Additional Permission | ℹ️ = Info Only",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

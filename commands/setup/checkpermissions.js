const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags
} = require("discord.js");
const { Application } = require("../../dbObjects.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("checkpermissions")
    .setDescription(
      "Check if Melpo has the required permissions to function properly"
    )
    .setContexts(0),
  async execute({ interaction }) {
    await interaction.deferReply();
    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember) {
      await interaction.reply({
        content: "Unable to fetch bot permissions",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const applications = await Application.findAll({
      where: { server_id: interaction.guild.id }
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
          PermissionsBitField.Flags[perm.name?.replace(/ /g, "")]
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
        } 
        else 
        { description += "*Perfect! No unneeded (dangerous) permissions*\n"; }
      } 
      catch 
      { description += "*Unable to check additional permissions*\n"; }
    }

    description += "\n### Channel-Specific Permissions\n";

    for (const app of applications) {
      if (applications.length > 1) 
      { description += `\n**Application: ${app.name}**\n`; }

      if (app?.verifychannel) {
        const verifyChannel = interaction.guild.channels.cache.get(
          app.verifychannel
        );
        description += `**Verify Channel (${verifyChannel ? verifyChannel : 'Unknown/Deleted'})**\n`;
        if (verifyChannel) {
          const verifyPerms = verifyChannel.permissionsFor(botMember);
          description += `${verifyPerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
          description += `${verifyPerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
          description += `${verifyPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
          description += `${verifyPerms.has(PermissionsBitField.Flags.EmbedLinks) ? "✅" : "❌"} Embed Links\n`;
        } 
        else 
        { description += `❌ Channel not found or deleted\n`; }
      }

      if (app?.reviewchannel) {
        const reviewChannel = interaction.guild.channels.cache.get(
          app.reviewchannel
        );
        description += `\n**Review Channel (${reviewChannel ? reviewChannel : 'Unknown/Deleted'})**\n`;
        if (reviewChannel) {
          const reviewPerms = reviewChannel.permissionsFor(botMember);
          description += `${reviewPerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
          description += `${reviewPerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
          description += `${reviewPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
          description += `${reviewPerms.has(PermissionsBitField.Flags.EmbedLinks) ? "✅" : "❌"} Embed Links\n`;
          description += `${reviewPerms.has(PermissionsBitField.Flags.CreatePrivateThreads) ? "✅" : "❌"} Create Private Threads\n`;
          description += `${reviewPerms.has(PermissionsBitField.Flags.SendMessagesInThreads) ? "✅" : "❌"} Send Messages In Threads\n`;
          description += `${reviewPerms.has(PermissionsBitField.Flags.ManageThreads) ? "✅" : "❌"} Manage Threads\n`;
        } 
        else 
        { description += `❌ Channel not found or deleted\n`; }
      }

      if (app?.verifylogs) {
        const logsChannel = interaction.guild.channels.cache.get(
          app.verifylogs
        );
        description += `\n**Verification Logs Channel (${logsChannel ? logsChannel : 'Unknown/Deleted'})**\n`;
        if (logsChannel) {
          const logsPerms = logsChannel.permissionsFor(botMember);
          description += `${logsPerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
          description += `${logsPerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
          description += `${logsPerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
          description += `${logsPerms.has(PermissionsBitField.Flags.EmbedLinks) ? "✅" : "❌"} Embed Links\n`;
          description += `${logsPerms.has(PermissionsBitField.Flags.CreatePrivateThreads) ? "✅" : "❌"} Create Private Threads\n`;
          description += `${logsPerms.has(PermissionsBitField.Flags.SendMessagesInThreads) ? "✅" : "❌"} Send Messages In Threads\n`;
          description += `${logsPerms.has(PermissionsBitField.Flags.ManageThreads) ? "✅" : "❌"} Manage Threads\n`;
        } 
        else 
        { description += `❌ Channel not found or deleted\n`; }
      }

      if (app?.verificationwelcomechannel) {
        const welcomeChannel = interaction.guild.channels.cache.get(
          app.verificationwelcomechannel
        );
        description += `\n**Verification Welcome Channel (${welcomeChannel ? welcomeChannel : 'Unknown/Deleted'})**\n`;
        if (welcomeChannel) {
          const welcomePerms = welcomeChannel.permissionsFor(botMember);
          description += `${welcomePerms.has(PermissionsBitField.Flags.ViewChannel) ? "✅" : "❌"} View Channel\n`;
          description += `${welcomePerms.has(PermissionsBitField.Flags.SendMessages) ? "✅" : "❌"} Send Messages\n`;
          description += `${welcomePerms.has(PermissionsBitField.Flags.ReadMessageHistory) ? "✅" : "❌"} Read Message History\n`;
          description += `${welcomePerms.has(PermissionsBitField.Flags.EmbedLinks) ? "✅" : "❌"} Embed Links\n`;
        } 
        else 
        { description += `❌ Channel not found or deleted\n`; }
      }
    }

    description += "\n### Role Hierarchy\n";
    const botRole = interaction.guild.members.me.roles.highest;

    description += `**Bot's Highest Role:** ${botRole} (Position: ${botRole.position})\n`;

    let roleHierarchyIssues = 0;

    for (const app of applications) {
      if (applications.length > 1) 
      { description += `\n**Application: ${app.name}**\n`; }

      if (app?.verifiedrole && app.verifiedrole.length > 0) {
        const verifiedRoles = Array.isArray(app.verifiedrole)
          ? app.verifiedrole
          : [app.verifiedrole];
        for (const roleId of verifiedRoles) {
          const verifiedRole = interaction.guild.roles.cache.get(roleId);
          if (verifiedRole) {
            const canManageRole = botRole.position > verifiedRole.position;
            if (!canManageRole) roleHierarchyIssues++;
            description += `**Verified Role:** ${verifiedRole} (Position: ${verifiedRole.position}) ${canManageRole ? "✅" : "❌"}\n`;
          }
        }
      }

      if (app?.unverifiedrole && app.unverifiedrole.length > 0) {
        const unverifiedRoles = Array.isArray(app.unverifiedrole)
          ? app.unverifiedrole
          : [app.unverifiedrole];
        for (const roleId of unverifiedRoles) {
          const unverifiedRole = interaction.guild.roles.cache.get(roleId);
          if (unverifiedRole) {
            const canManageRole = botRole.position > unverifiedRole.position;
            if (!canManageRole) roleHierarchyIssues++;
            description += `**Unverified Role:** ${unverifiedRole} (Position: ${unverifiedRole.position}) ${canManageRole ? "✅" : "❌"}\n`;
          }
        }
      }

      if (app?.autorole && app.autorole.length > 0) {
        const autoRoles = Array.isArray(app.autorole)
          ? app.autorole
          : [app.autorole];
        for (const roleId of autoRoles) {
          const autoRole = interaction.guild.roles.cache.get(roleId);
          if (autoRole) {
            const canManageRole = botRole.position > autoRole.position;
            if (!canManageRole) roleHierarchyIssues++;
            description += `**Auto Role:** ${autoRole} (Position: ${autoRole.position}) ${canManageRole ? "✅" : "❌"}\n`;
          }
        }
      }

      if (app?.managerrole && app.managerrole.length > 0) {
        const managerRoles = Array.isArray(app.managerrole)
          ? app.managerrole
          : [app.managerrole];
        for (const roleId of managerRoles) {
          const managerRole = interaction.guild.roles.cache.get(roleId);
          if (managerRole) 
          { description += `**Manager Role:** ${managerRole} (Position: ${managerRole.position}) ℹ️\n`; }
        }
      }
    }

    description += "\n### TLDR\n";
    const missingPermissions = requiredPermissions.filter((perm) => {
      try {
        return !botMember.permissions.has(
          PermissionsBitField.Flags[perm.name?.replace(/ /g, "")],
        );
      } 
      catch 
      { return true; }
    });

    if (missingPermissions.length === 0) 
    { description += "✅ **All required permissions are present**\n"; } 
    else 
    { description += `❌ **Missing ${missingPermissions.length} required permission(s)**\n`; }

    if (roleHierarchyIssues === 0) 
    { description += "✅ **Bot can manage all configured roles**\n"; } 
    else 
    { description += `❌ **Cannot manage ${roleHierarchyIssues} role(s) - Move bot role higher**\n`; }

    const hasIssues = missingPermissions.length > 0 || roleHierarchyIssues > 0;

    const embed = new EmbedBuilder()
      .setColor(hasIssues ? 0xff0000 : 0x00ff00)
      .setTitle("Permission Check Results")
      .setDescription(description)
      .setFooter({
        text: "✅ = Has Permission/Can Manage | ❌ = Missing Permission/Cannot Manage | ⚠️ = Additional Permission | ℹ️ = Info Only",
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};

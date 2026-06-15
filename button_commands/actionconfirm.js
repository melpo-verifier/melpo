const {
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags
} = require("discord.js");
const { Verification, Application } = require("../dbObjects.js");
const {
  checkManagerPermission,
  handleV2Edit,
  VerificationStatus,
  relinkAttachments,
  processLogMessages,
  cleanupVerificationData,
  getMessageIds
} = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client, userid, context, applicationId }) => {
  await interaction.deferUpdate();

  // context[0] is applicationId, context[1] is the user ID who pressed the button
  const originaluserid = context[1]?.toString();
  if (originaluserid && originaluserid !== interaction.user.id) {
    return await interaction.followUp({
      content: "This verification is already handled by another user!",
      flags: MessageFlags.Ephemeral
    });
  }

  if (!userid) 
  { throw new Error("Could not fetch user ID from the embed"); }

  const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);
  if (error) {
    return interaction.followUp({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Check manager permissions
  const permCheck = await checkManagerPermission(interaction, application);
  if (!permCheck.allowed) {
    return interaction.followUp({
      content: permCheck.message,
      flags: MessageFlags.Ephemeral
    });
  }

  const user = await client.users.fetch(userid);
  const kickEmbed = new EmbedBuilder()
    .setColor("#EB2121")
    .setTitle(`Kicked from ${interaction.guild.name}`)
    .setDescription(`You've been kicked from ${interaction.guild.name}`);

  let member;
  try {
    member = await interaction.guild.members.fetch(userid);
    if (!member) {
      return interaction.followUp({
        content: "This user is no longer in the server.",
        flags: MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    if (error.code === 10007) {
      // Unknown Member
      return interaction.followUp({
        content: "This user is no longer in the server.",
        flags: MessageFlags.Ephemeral
      });
    }
    throw error;
  }

  const botMember = interaction.guild.members.cache.get(client.user.id);

  if (!member) {
    return interaction.followUp({
      content: `Could not find member with ID ${userid}, probably because they have left the server.`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Check if bot has kick permission
  if (!botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    return interaction.followUp({
      content: "I don't have permission to kick members",
      flags: MessageFlags.Ephemeral
    });
  }

  // Check if target is owner
  if (member.id === interaction.guild.ownerId) {
    return interaction.followUp({
      content: "I cannot kick the server owner",
      flags: MessageFlags.Ephemeral
    });
  }

  // Check role hierarchy
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.followUp({
      content:
        "I cannot kick this user - they have a role higher than or equal to mine, please make sure my highest role is higher than the user's highest role",
      flags: MessageFlags.Ephemeral
    });
  }

  await user.send({ embeds: [kickEmbed] }).catch(() => {});
  await member.kick(`Kicked by ${interaction.user.username}`);

  const verification = await Verification.findOne({
    where: { userId: userid }
  });

  const allApplications = await Application.findAll({
    where: { server_id: interaction.guild.id },
    attributes: ["id", "reviewchannel", "verifylogs"]
  });

  // Edit messages from all applications
  for (const app of allApplications) {
    const appMessageIds = getMessageIds(verification, interaction.guild.id, app.id);
    if (!appMessageIds || appMessageIds.length === 0) continue;

    try {
      await processLogMessages({
        interaction,
        client,
        application: app,
        messageids: appMessageIds,
        user: member,
        status: VerificationStatus.KICKED,
        useRateLimiting: false
      });
    } catch (logError) {
      if (!logError.code === 50001 || !logError.code === 50013) 
      { console.error("Error processing log messages:", logError); }
    }
  }

  // If no separate log channel, edit the current message
  if (!application?.verifylogs || application.reviewchannel === application.verifylogs) {
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      const { container, files } = relinkAttachments(interaction.message);

      const tempMsg = { ...interaction.message, components: [container] };
      const kickedContainer = handleV2Edit(
        interaction,
        tempMsg,
        VerificationStatus.KICKED
      );

      const editPayload = {
        flags: [MessageFlags.IsComponentsV2],
        components: [kickedContainer]
      };
      if (files) editPayload.files = files;
      await interaction.editReply(editPayload);

      if (interaction.message.thread) 
      { await interaction.message.thread.setArchived(true); }
    }
  }

  // Cleanup verification data for entire guild (user is kicked from server)
  await cleanupVerificationData(verification, interaction.guild.id, userid);
};

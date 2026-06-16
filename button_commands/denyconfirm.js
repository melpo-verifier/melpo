const { MessageFlags } = require("discord.js");
const { Verification, Submissions } = require("../dbObjects.js");
const {
  checkManagerPermission,
  validateRoles,
  handleV2Edit,
  VerificationStatus,
  relinkAttachments,
  processLogMessages,
  cleanupVerificationData,
  sendDenyDM,
  applyRoles,
  getMessageIds
} = require("../js/verificationHandler.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");
const { isPremiumServer } = require("../js/DBFunctions.js");

module.exports = async ({ interaction, client, userid, context, applicationId }) => {
  await interaction.deferUpdate();

  // Check if another user is handling this verification
  const originaluserid = context[1]?.toString();
  if (originaluserid && originaluserid !== interaction.user.id) {
    return await interaction.followUp({
      content: "This verification is already handled by another user!",
      flags: MessageFlags.Ephemeral
    });
  }

  if (!userid) { throw new Error("Could not fetch user ID from the embed"); }

  const { application, error } = await getApplicationByIdWithFallback(applicationId, interaction.guild.id);

  if (error) {
    return await interaction.followUp({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Check manager permissions
  const permCheck = await checkManagerPermission(interaction, application);
  if (!permCheck.allowed) {
    return await interaction.followUp({
      content: permCheck.message,
      flags: MessageFlags.Ephemeral
    });
  }

  const user = await client.users.fetch(userid);

  // Get verification data
  const verification = await Verification.findOne({ where: { userId: userid } });
  const messageids = getMessageIds(verification, interaction.guild.id, applicationId);

  // Try to get member for processLogMessages
  let member;
  try { 
    member = await interaction.guild.members.fetch(userid); 
  } catch { 
    member = { user, id: userid }; 
  }
  
  let rolesToApply = [];
  console.log(application.deniedrole)

  //check deny count if there exists a threshold, if it meets threshold apply deny role if it exists
  if (application.maxdenials && application.deniedrole?.length > 0 && await isPremiumServer(interaction.guild.id)) {
    //check if premium is active

    const denyCount = await Submissions.count({
      where: { user_id: userid, guild_id: interaction.guild.id, app_id: String(applicationId), status: "denied" },
    });

    if (denyCount + 1 >= application.maxdenials) { 
      rolesToApply.push(application.deniedrole); 
    }
  } 
  else if (application.deniedrole?.length > 0) { 
    rolesToApply.push(application.deniedrole); 
  }

  if(rolesToApply.length > 0) {
    // Validate roles
    const roleErrors = await validateRoles(
      interaction,
      rolesToApply,
      null
    );
    if (roleErrors.length > 0) {
      return await interaction.followUp({
        content: roleErrors[0],
        flags: MessageFlags.Ephemeral
      });
    }

    await applyRoles(member, rolesToApply, null, interaction);
  }

  // Process log messages
  try {
    await processLogMessages({
      interaction,
      client,
      application,
      messageids,
      user: member,
      status: VerificationStatus.DENIED,
      useRateLimiting: false
    });
  } catch (logError) {
    if (logError.code === 50001 || logError.code === 50013) {
      console.warn(`Missing permissions for log messages in guild ${interaction.guild.id}`);
      await interaction.followUp({
        content: "Warning: Could not process log messages due to missing permissions.",
        flags: MessageFlags.Ephemeral
      }).catch(() => { });
    } 
    else { 
      throw logError; 
    }
  }

  // If no separate log channel, edit the current message
  if (!application.verifylogs || application.reviewchannel === application.verifylogs) {
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      const { container, files } = relinkAttachments(interaction.message);

      const tempMsg = { ...interaction.message, components: [container] };
      const deniedContainer = handleV2Edit(
        interaction,
        tempMsg,
        VerificationStatus.DENIED
      );

      const editPayload = {
        flags: [MessageFlags.IsComponentsV2],
        components: [deniedContainer]
      };

      if (files) editPayload.files = files;
      
      await interaction.editReply(editPayload);

      if (interaction.message.thread) { 
        await interaction.message.thread.setArchived(true); 
      }
    }
  }

  //mark submission as denied
  await Submissions.update(
    { status: "denied" },
    { where: { message_id: interaction.message.id, status: "completed" } }
  ).catch((e) => { console.error("Error updating submission status:", e); });

  // Cleanup verification data
  if (messageids && messageids.length > 0) { 
    await cleanupVerificationData(verification, interaction.guild.id, userid, applicationId); 
  }

  // Send denial DM
  const dmResult = await sendDenyDM(interaction.user.username, user, application, interaction.guild.name);

  if (dmResult.dmDisabled) {
    await interaction.followUp({
      content: `✅ User denied successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
      flags: MessageFlags.Ephemeral
    });
  } else {
    await interaction.followUp({
      content: `✅ User denied successfully!${rolesToApply.length > 0 ? `\nThe deny role(s) has been applied to the user.` : ""}`,
      flags: MessageFlags.Ephemeral
    });
  }
};

const {
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require("discord.js");
const { Verification, InviteTracker } = require("../dbObjects.js");
const { resolveImage } = require("./imageUtils.js");

const VerificationStatus = {
  VERIFIED: "verified",
  DENIED: "denied",
};

const StatusColors = {
  [VerificationStatus.VERIFIED]: 0x008000,
  [VerificationStatus.DENIED]: 0xeb2121,
};

async function rateLimitedOperation(operation, maxRetries = 3) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (error.name === "RateLimitError" || error.code === 429) {
        const waitTime = (error.retryAfter || 2000) + retries * 1000;
        console.log(
          `Rate limited, waiting ${waitTime}ms (attempt ${retries + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retries++;
      } else if (error.code === 10008) {
        throw error;
      } else if (error.code === 50001 || error.code === 50013) {
        throw error;
      } else {
        if (retries === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          retries++;
        } else {
          throw error;
        }
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries} retries`);
}

// Check if user has permission to manage verifications
async function checkManagerPermission(interaction, application) {
  if (application && Array.isArray(application.managerrole) && application.managerrole.length > 0) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = application.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return {
        allowed: false,
        message: `You do not have permission to manage verifications. You need one of the following roles: ${application.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
      };
    }
  }

  return { allowed: true };
}


// Check if interaction is in the review channel or a thread under it
function isInReviewChannel(interaction, reviewChannelId) {
  if (!reviewChannelId) return true;
  
  // Direct channel match
  if (interaction.channel.id === reviewChannelId) return true;
  
  // Check if in a thread under the review channel
  if (interaction.channel.isThread && interaction.channel.parentId === reviewChannelId) {
    return true;
  }
  
  return false;
}

// Validate roles exist and bot can manage them
async function validateRoles(interaction, verifiedRoles, unverifiedRoles) {
  const errors = [];

  if (verifiedRoles && verifiedRoles.length > 0) {
    for (const roleId of verifiedRoles) {
      const role = await interaction.guild.roles.fetch(roleId);
      if (!role) {
        errors.push(`Verified role with ID ${roleId} not found. Please update your server configuration.`);
        continue;
      }
      if (interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
        errors.push(`Cannot assign role ${role.name} because it's higher than or equal to my highest role.`);
      }
    }
  } else {
    errors.push("No verified role set up. Please set up a verified role using the `/setup` command.");
  }

  if (unverifiedRoles && unverifiedRoles.length > 0) {
    for (const roleId of unverifiedRoles) {
      const role = await interaction.guild.roles.fetch(roleId);
      if (role && interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
        errors.push(`Cannot remove role ${role.name} because it's higher than or equal to my highest role.`);
      }
    }
  }

  return errors;
}

// Apply roles to user (add verified, remove unverified)
async function applyRoles(user, verifiedRoles, unverifiedRoles) {
  if (unverifiedRoles && unverifiedRoles.length > 0) {
    for (const roleId of unverifiedRoles) {
      await user.roles.remove(roleId).catch(console.error);
    }
  }

  if (verifiedRoles && verifiedRoles.length > 0) {
    for (const roleId of verifiedRoles) {
      await user.roles.add(roleId).catch(console.error);
    }
  }
}

// Handle V2 container edit for verification/denial
function handleV2Edit(interaction, message, status) {
  const color = StatusColors[status];
  const statusText = status === VerificationStatus.VERIFIED ? "Verified" : "Denied";

  const editedContainer = new ContainerBuilder({
    accent_color: color,
  });

  const originalContainer = message.components[0];

  if (originalContainer?.components) {
    for (const component of originalContainer.components) {
      if (component.type === 9) {
        let content = component.components[0].content;
        content = content.replace(/<@&\d+>/g, "").trim();

        editedContainer.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder({
                content: content + `\n**Status:** \`${statusText} by ${interaction.user.username}\``,
              }),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder({
                media: { url: component.accessory.media.url },
              }),
            ),
        );
      } else if (component.type === 10) {
        editedContainer.addTextDisplayComponents(
          new TextDisplayBuilder({
            content: component.content,
          }),
        );
      } else if (component.type === 14) {
        editedContainer.addSeparatorComponents(
          new SeparatorBuilder({
            spacing: component.spacing || SeparatorSpacingSize.Small,
          }),
        );
      } else if (component.type === 12) {
        if (component.items?.length > 0) {
          const mappedurls = component.items?.map((item) => ({
            media: { url: item.media.url },
          }));
          editedContainer.addMediaGalleryComponents(
            new MediaGalleryBuilder({
              items: mappedurls,
            }),
          );
        }
      }
    }
  }

  editedContainer.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: `-# ${statusText} by ${interaction.user.username} (${interaction.user.id})`,
    }),
  );

  return editedContainer;
}

// Process text placeholders for welcome messages
async function processText(text, user, interaction, originalEmbed, verifiedRoles) {
  if (!text) return null;

  // Handle question placeholders
  if (text.toLowerCase().includes("{q") && originalEmbed) {
    const regex = /\{q[0-9]\}/gi;
    const matches = text.match(regex);

    if (matches) {
      matches.forEach((match) => {
        const questionNumber = match.slice(2, -1);
        const field = originalEmbed.fields?.find((field) =>
          field.value.startsWith(`**${questionNumber}.**`),
        );

        if (field) {
          const answer = field.value.split("_ _")[1]?.trim() || "No answer provided";
          text = text.replace(new RegExp(match, "gi"), answer);
        }
      });
    }
  } else if (
    text.toLowerCase().includes("{q") &&
    interaction.message?.flags?.has(MessageFlags.IsComponentsV2)
  ) {
    const regex = /\{q[0-9]\}/gi;
    const matches = text.match(regex);

    if (matches) {
      matches.forEach((match) => {
        const questionNumber = parseInt(match.slice(2, -1));
        const component = interaction.message.components[0]?.components[questionNumber + 1];

        if (component && component.content) {
          const answer = component.content.split("_ _")[1]?.trim() || "No answer provided";
          text = text.replace(new RegExp(match, "gi"), answer);
        }
      });
    }
  } else if (text.toLowerCase().includes("{q")) {
    text = text.replace(/{q[0-9]}/gi, "");
  }

  // Replace user placeholders
  text = text.replace(/{username}/gi, user.user.globalName ?? user.user.username);
  text = text.replace(/{usermention}/gi, `<@${user.id}>`);
  text = text.replace(/{members}/gi, interaction.guild.memberCount);

  // Count verified members
  if (text.toLowerCase().includes("{verifiedmembers}")) {
    const verifiedMembers = await interaction.guild.members
      .fetch()
      .then((members) => {
        return members.filter((member) =>
          verifiedRoles.some((role) => member.roles.cache.has(role)),
        ).size;
      })
      .catch((error) => {
        console.error(error);
        return 0;
      });
    text = text.replace(/{verifiedmembers}/gi, verifiedMembers);
  }

  text = text.replace(/{modname}/gi, interaction.user.globalName ?? interaction.user.username);
  text = text.replace(/\${interaction.guild.name}/gi, interaction.guild.name);

  return text && text.trim() ? text : null;
}

// Get mentions from content for pinging
function getMentions(content) {
  if (!content) return "";
  const userMentions = content.match(/<@!?(\d+)>/g) || [];
  const roleMentions = content.match(/<@&(\d+)>/g) || [];
  const uniqueUserMentions = new Set(userMentions);
  const uniqueRoleMentions = new Set(roleMentions);
  return `${Array.from(uniqueUserMentions).join(" ")} ${Array.from(uniqueRoleMentions).join(" ")}`.trim();
}

// Send welcome message to channel
async function sendWelcomeMessage(interaction, user, welcomeChannel, welcomeMessage, originalEmbed, verifiedRoles) {
  if (!welcomeChannel || !welcomeMessage) return;

  const channel = interaction.guild.channels.cache.get(welcomeChannel);
  if (!channel) {
    throw new Error(`Welcome channel ${welcomeChannel} not found`);
  }

  if (welcomeMessage.text) {
    const finalText = await processText(
      welcomeMessage.text,
      user,
      interaction,
      originalEmbed,
      verifiedRoles,
    );
    const textImage = resolveImage(welcomeMessage.image, "welcomemessage");

    const files = [];
    if (textImage.filePath) {
      files.push(new AttachmentBuilder(textImage.filePath).setName(textImage.attachmentName));
    }

    const finalmessage = { content: finalText, files };

    if (!textImage.filePath && textImage.embedUrl) {
      finalmessage.embeds = [new EmbedBuilder().setImage(textImage.embedUrl)];
    }

    await channel.send(finalmessage);
  } else {
    const finalTitle = welcomeMessage.title
      ? await processText(welcomeMessage.title, user, interaction, originalEmbed, verifiedRoles)
      : null;
    const finalDescription = welcomeMessage.description
      ? await processText(welcomeMessage.description, user, interaction, originalEmbed, verifiedRoles)
      : null;
    const messageContent = getMentions(finalDescription);

    const imageAsset = resolveImage(welcomeMessage.image, "welcomemessage");

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(finalTitle && finalTitle.trim() ? finalTitle : null)
      .setDescription(finalDescription)
      .setColor(welcomeMessage.color ?? "#3f7ff1")
      .setImage(imageAsset.embedUrl);

    if (imageAsset.embedUrl) {
      welcomeEmbed.setAuthor({
        name: user.user.globalName ?? user.user.username,
        iconURL: user.user.displayAvatarURL({ dynamic: true, size: 128 }),
      });
    } else {
      welcomeEmbed.setThumbnail(user.user.displayAvatarURL({ dynamic: true, size: 512 }));
    }

    await channel.send({
      content: messageContent || null,
      embeds: [welcomeEmbed],
      files: imageAsset.filePath
        ? [new AttachmentBuilder(imageAsset.filePath).setName(imageAsset.attachmentName)]
        : [],
    });
  }
}

// Send verification DM to user
async function sendVerifyDM(user, application, interaction, verifiedRoles) {
  if (!application.verifymessage) return;

  const { title, description, color, image } = application.verifymessage;

  const finalTitle = await processText(title, user, interaction, null, verifiedRoles);
  const finalDescription = await processText(description, user, interaction, null, verifiedRoles);
  const dmImage = resolveImage(image, "verifymessage");

  const finalEmbed = new EmbedBuilder()
    .setTitle(finalTitle ?? null)
    .setDescription(finalDescription)
    .setColor(color)
    .setImage(dmImage.embedUrl);

  await user.send({
    embeds: [finalEmbed],
    files: dmImage.filePath
      ? [new AttachmentBuilder(dmImage.filePath).setName(dmImage.attachmentName)]
      : [],
  }).catch(() => {});
}

// Send denial DM to user
async function sendDenyDM(user, guildName, reason = null) {
  const denyEmbed = new EmbedBuilder()
    .setColor("#EB2121")
    .setTitle("Application Denied")
    .setDescription(
      `Your application into **${guildName}** has been denied!\n**Reason:** ${reason || "none given"}`,
    );

  try {
    await user.send({ embeds: [denyEmbed] });
    return { success: true };
  } catch (error) {
    if (error.code === 50007) {
      return { success: false, dmDisabled: true };
    }
    throw error;
  }
}

// Create thread summary embed from thread messages
async function createThreadSummary(thread, client, status) {
  const color = StatusColors[status];
  const threadEmbed = new EmbedBuilder()
    .setTitle("Thread Summary")
    .setColor(color);

  try {
    const threadMessages = await thread.messages.fetch();

    if (threadMessages.size > 1) {
      const messagesArray = Array.from(threadMessages.values())
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .slice(1);

      const formattedMessages = messagesArray.map((msg) => {
        let content;

        if (msg.flags?.has(MessageFlags.IsComponentsV2)) {
          content = msg.components?.[0]?.components?.[0]?.content || "No content";
        } else {
          content = msg.content || "No content";
        }

        if (msg.author.id === client.user.id) {
          content = content.replace(/### Question answered by[^\n]*\n?/g, "\n");
        }

        return `\`${msg.author.username}:\` ${content}`;
      });

      const finalContent = formattedMessages.join("\n").slice(0, 4096);
      threadEmbed.setDescription(finalContent || "No messages in thread");
    } else {
      threadEmbed.setDescription("No additional messages in thread");
    }
  } catch (error) {
    console.error("Error fetching thread messages:", error);
    threadEmbed.setDescription("Error loading thread messages");
  }

  return threadEmbed;
}

// Process log messages
async function processLogMessages(options) {
  const {
    interaction,
    client,
    application,
    messageids,
    user,
    status,
    useRateLimiting = false,
  } = options;

  const statusText = status === VerificationStatus.VERIFIED ? "VERIFIED" : "DENIED";
  const color = StatusColors[status];

  const hasSeparateLogChannel =
    application.verifylogs &&
    messageids &&
    application.reviewchannel !== application.verifylogs;

  if (hasSeparateLogChannel) {
    const reviewChannel = interaction.guild.channels.cache.get(application.reviewchannel);
    const logChannel = interaction.guild.channels.cache.get(application.verifylogs);

    if (logChannel && reviewChannel && messageids && messageids.length > 0) {
      const messages = [];
      for (const messageId of messageids) {
        try {
          const fetchOp = async () => reviewChannel.messages.fetch(messageId);
          const message = useRateLimiting
            ? await rateLimitedOperation(fetchOp)
            : await fetchOp();
          if (message) messages.push(message);
          if (!useRateLimiting) await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          if (error.code === 10008) {
            console.log(`Message ${messageId} not found - skipping`);
            continue;
          }
          throw error;
        }
      }

      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const message of messages) {
        if (!useRateLimiting) await new Promise((resolve) => setTimeout(resolve, 600));

        try {
          if (message.flags?.has(MessageFlags.IsComponentsV2)) {
            const editedContainer = handleV2Edit(interaction, message, status);

            let threadEmbed;
            if (message.thread) {
              threadEmbed = await createThreadSummary(message.thread, client, status);
            }

            const sendOp = async () =>
              logChannel.send({
                flags: [MessageFlags.IsComponentsV2],
                components: [editedContainer],
              });

            const sendmessage = useRateLimiting
              ? await rateLimitedOperation(sendOp)
              : await sendOp();

            const threadOp = async () =>
              sendmessage.startThread({
                name: `${user.user?.username || user.username}'s log`,
              });

            const threadchannel = useRateLimiting
              ? await rateLimitedOperation(threadOp)
              : await threadOp();

            if (threadEmbed) {
              const embedOp = async () => threadchannel.send({ embeds: [threadEmbed] });
              useRateLimiting ? await rateLimitedOperation(embedOp) : await embedOp();
            }

            const archiveOp = async () => threadchannel.setArchived(true);
            useRateLimiting ? await rateLimitedOperation(archiveOp) : await archiveOp();

            if (message.thread) {
              const deleteThreadOp = async () => message.thread.delete();
              (useRateLimiting
                ? rateLimitedOperation(deleteThreadOp)
                : deleteThreadOp()
              ).catch(console.error);
            }

            const deleteOp = async () => message.delete();
            (useRateLimiting ? rateLimitedOperation(deleteOp) : deleteOp()).catch(console.error);
          } else if (message.embeds && message.embeds[0]) {
            const originalembed = message.embeds[0];

            const Embed = new EmbedBuilder(originalembed)
              .setColor(color)
              .setTitle((originalembed.title || "Verification") + ` (${statusText})`)
              .setFooter({
                text: `${statusText === "VERIFIED" ? "Verified" : "Denied"} by ${interaction.user.username} | ${originalembed?.footer?.text || user.id}`,
              });

            const logOp = async () =>
              logChannel.send({
                content: `<@${user.id}>`,
                embeds: [Embed],
              });

            useRateLimiting ? await rateLimitedOperation(logOp) : await logOp();

            const delOp = async () => message.delete();
            (useRateLimiting ? rateLimitedOperation(delOp) : delOp()).catch(console.error);
          }
        } catch (error) {
          console.error("Error processing log message:", error);
        }
      }
    }
  } else {
    if (messageids && messageids.length > 0) {
      for (const messageId of messageids) {
        // Skip the current message if being handled separately
        if (messageId === interaction.message?.id) continue;

        try {
          const fetchOp = async () => interaction.channel.messages.fetch(messageId);
          const message = useRateLimiting
            ? await rateLimitedOperation(fetchOp)
            : await fetchOp();

          if (!useRateLimiting) await new Promise((resolve) => setTimeout(resolve, 1000));

          if (message && message.author.id === client.user.id) {
            const footerText = message.embeds?.[0]?.footer?.text || "";
            const alreadyProcessed =
              footerText.includes("Verified") || footerText.includes("Denied");

            if (!alreadyProcessed) {
              if (message.flags?.has(MessageFlags.IsComponentsV2)) {
                const editedContainer = handleV2Edit(interaction, message, status);
                const editOp = async () =>
                  message.edit({
                    flags: [MessageFlags.IsComponentsV2],
                    components: [editedContainer],
                  });
                useRateLimiting ? await rateLimitedOperation(editOp) : await editOp();
              } else if (message.embeds && message.embeds[0]) {
                const originalembed = message.embeds[0];

                const Embed = new EmbedBuilder(originalembed)
                  .setColor(color)
                  .setTitle((originalembed.title || "Verification") + ` (${statusText})`)
                  .setFooter({
                    text: `${statusText === "VERIFIED" ? "Verified" : "Denied"} by ${interaction.user.username} | ${originalembed?.footer?.text || user.id}`,
                  });

                const editOp = async () => message.edit({ embeds: [Embed], components: [] });
                useRateLimiting ? await rateLimitedOperation(editOp) : await editOp();
              }
            }
          }
        } catch (error) {
          if (error.code === 10008) {
            console.log(`Message ${messageId} not found - skipping`);
            continue;
          }
          console.error(`Failed to process message with ID ${messageId}: ${error}`);
        }
      }
    }
  }
}

// Clean up verification data from database
async function cleanupVerificationData(verification, guildId) {
  if (verification?.guildVerifications?.[guildId]) {
    delete verification.guildVerifications[guildId];
    verification.changed("guildVerifications", true);
    await verification.save();
  }
}

// Create "no application" embed for users verified/denied without application
function createNoApplicationEmbed(user, interaction, invitetracker, status) {
  const statusText = status === VerificationStatus.VERIFIED ? "VERIFIED" : "DENIED";
  const actionText = status === VerificationStatus.VERIFIED ? "Verified" : "Denied";
  const color = StatusColors[status];

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${user.user.username} (${statusText})`)
    .setThumbnail(user.displayAvatarURL({ size: 2048, format: "png" }))
    .addFields({
      name: "Member info",
      value: `[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.user.globalName ?? user.user.username}\`\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(user.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`,
    })
    .setFooter({ text: `${actionText} by ${interaction.user.username}` });
}

// Main verification handler
async function verifyUser(options) {
  const {
    interaction,
    client,
    userId,
    application,
    originalEmbed = null,
    useRateLimiting = false,
  } = options;

  const user = await interaction.guild.members.fetch(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const verifiedRoles = application.verifiedrole;
  const unverifiedRoles = application.unverifiedrole;
  const welcomeMessage = application.verificationwelcomemessage;
  const welcomeChannel = application.verificationwelcomechannel;

  // Apply roles
  await applyRoles(user, verifiedRoles, unverifiedRoles);

  // Get verification data
  const verification = await Verification.findOne({ where: { userId } });
  const messageids = verification?.guildVerifications?.[interaction.guild.id] || [];
  const invitetracker = await InviteTracker.findOne({
    where: { unique_id: `${userId}_${interaction.guild.id}` },
  });

  // Process log messages
  await processLogMessages({
    interaction,
    client,
    application,
    messageids,
    user,
    status: VerificationStatus.VERIFIED,
    useRateLimiting,
  });

  // If no messages and separate log channel, send "no application" embed
  if (
    application.verifylogs &&
    application.reviewchannel !== application.verifylogs &&
    (!messageids || messageids.length === 0)
  ) {
    const logChannel = interaction.guild.channels.cache.get(application.verifylogs);
    if (logChannel) {
      const embed = createNoApplicationEmbed(user, interaction, invitetracker, VerificationStatus.VERIFIED);
      const sendOp = async () => logChannel.send({ content: `<@${userId}>`, embeds: [embed] });
      useRateLimiting ? await rateLimitedOperation(sendOp) : await sendOp();
    }
  }

  // Cleanup verification data
  if (messageids && messageids.length > 0) {
    await cleanupVerificationData(verification, interaction.guild.id);
  }

  // Send welcome message
  try {
    await sendWelcomeMessage(interaction, user, welcomeChannel, welcomeMessage, originalEmbed, verifiedRoles);
  } catch (error) {
    console.error("Error sending welcome message:", error);
  }

  // Send DM
  await sendVerifyDM(user, application, interaction, verifiedRoles);

  return { success: true, user };
}

// Main denial handler
async function denyUser(options) {
  const {
    interaction,
    client,
    userId,
    application,
    reason = null,
    useRateLimiting = false,
  } = options;

  const user = await client.users.fetch(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Get member
  let member;
  try {
    member = await interaction.guild.members.fetch(userId);
  } catch {
    member = { user, id: userId };
  }

  // Get verification data
  const verification = await Verification.findOne({ where: { userId } });
  const messageids = verification?.guildVerifications?.[interaction.guild.id] || [];
  const invitetracker = await InviteTracker.findOne({
    where: { unique_id: `${userId}_${interaction.guild.id}` },
  });

  // Process log messages
  await processLogMessages({
    interaction,
    client,
    application,
    messageids,
    user: member,
    status: VerificationStatus.DENIED,
    useRateLimiting,
  });

  // If no messages and separate log channel, send "no application" embed
  if (
    application.verifylogs &&
    application.reviewchannel !== application.verifylogs &&
    (!messageids || messageids.length === 0)
  ) {
    const logChannel = interaction.guild.channels.cache.get(application.verifylogs);
    if (logChannel && member.displayAvatarURL) {
      const embed = createNoApplicationEmbed(member, interaction, invitetracker, VerificationStatus.DENIED);
      const sendOp = async () => logChannel.send({ content: `<@${userId}>`, embeds: [embed] });
      useRateLimiting ? await rateLimitedOperation(sendOp) : await sendOp();
    }
  }

  // Cleanup verification data
  if (messageids && messageids.length > 0) {
    await cleanupVerificationData(verification, interaction.guild.id);
  }

  // Send deny DM
  const dmResult = await sendDenyDM(user, interaction.guild.name, reason);

  return { success: true, user, dmDisabled: dmResult.dmDisabled };
}

module.exports = {
  VerificationStatus,
  StatusColors,
  rateLimitedOperation,
  checkManagerPermission,
  isInReviewChannel,
  validateRoles,
  applyRoles,
  handleV2Edit,
  processText,
  getMentions,
  sendWelcomeMessage,
  sendVerifyDM,
  sendDenyDM,
  createThreadSummary,
  processLogMessages,
  cleanupVerificationData,
  createNoApplicationEmbed,
  verifyUser,
  denyUser,
};

const {
  EmbedBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  PermissionsBitField,
  FileBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  WebhookClient,
} = require("discord.js");
const { Verification, InviteTracker, Submissions, GuildWebhook } = require("../dbObjects.js");
const { resolveImage } = require("./imageUtils.js");
const { decryptData } = require("./DBFunctions.js");
const { Op } = require("sequelize");

function getMessageIds(verification, guildId, applicationId = null) {
  const guildData = verification?.guildVerifications?.[guildId];
  if (!guildData) return [];

  if (Array.isArray(guildData)) {
    return guildData;
  }

  if (applicationId != null) {
    return guildData[applicationId] || [];
  }

  return Object.values(guildData).flat();
}

function addMessageId(verification, guildId, applicationId, messageId) {
  if (!verification.guildVerifications) {
    verification.guildVerifications = {};
  }

  let guildData = verification.guildVerifications[guildId];

  if (!guildData || Array.isArray(guildData)) {
    verification.guildVerifications[guildId] = {};
    guildData = verification.guildVerifications[guildId];
  }

  if (!guildData[applicationId]) {
    guildData[applicationId] = [];
  }

  guildData[applicationId].push(messageId);
  verification.changed("guildVerifications", true);
}

const VerificationStatus = {
  VERIFIED: "verified",
  DENIED: "denied",
  KICKED: "kicked",
  LEFT: "left",
};

const StatusColors = {
  [VerificationStatus.VERIFIED]: 0x008000,
  [VerificationStatus.DENIED]: 0xeb2121,
  [VerificationStatus.KICKED]: 0xeb2121,
  [VerificationStatus.LEFT]: 0x808080,
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
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        errors.push(`Role with ID ${roleId} not found. Please update your server configuration.`);
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
      const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
      if (role && interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
        errors.push(`Cannot remove role ${role.name} because it's higher than or equal to my highest role.`);
      }
    }
  }

  return errors;
}

// Apply roles to user (add verified, remove unverified)
async function applyRoles(user, verifiedRoles, unverifiedRoles, interaction) {
  if (unverifiedRoles && unverifiedRoles.length > 0) {
    for (const roleId of unverifiedRoles) {
      await user.roles.remove(roleId).catch(
        (err) => {
          if (err.code === 10011) {
            interaction.channel.send(`Unknown role ${roleId} during removal, skipping. Please reconfigure your roles in setup.`).catch(() => { });
          } else {
            console.error(`Failed to remove role ${roleId}: ${err.message}`);
          }
        }
      );
    }
  }

  if (verifiedRoles && verifiedRoles.length > 0) {
    for (const roleId of verifiedRoles) {
      await user.roles.add(roleId).catch(
        (err) => {
          if (err.code === 10011) {
            interaction.channel.send(`Unknown role ${roleId} during addition, skipping. Please reconfigure your roles in setup.`).catch(() => { });
          } else {
            console.error(`Failed to add role ${roleId}: ${err.message}`);
          }
        }
      );
    }
  }
}

function createAutoActionContainer(container, status, client, reason = null) {
  const mockInteraction = {
    isAutoDeny: true,
    client: client
  };
  const mockMessage = {
    components: [container]
  };
  return handleV2Edit(mockInteraction, mockMessage, status, reason);
}

function handleV2Edit(interaction, message, status, reason = null) {
  const MAX_DISPLAYABLE_TEXT = 4000;
  const color = StatusColors[status];
  const statusTextMap = {
    [VerificationStatus.VERIFIED]: "Verified",
    [VerificationStatus.DENIED]: "Denied",
    [VerificationStatus.KICKED]: "Kicked",
  };
  const statusText = statusTextMap[status] || "Denied";

  const actorName = interaction.isAutoDeny ? "Melpo (Auto-Action)" : interaction.user.username;
  const actorId = interaction.isAutoDeny ? interaction.client.user.id : interaction.user.id;

  const footerText = `-# ${statusText} by ${actorName} (${actorId})`;
  const statusSuffix = reason
    ? `\n**Status:** \`${statusText} by ${actorName}\`: ${reason}`
    : `\n**Status:** \`${statusText} by ${actorName}\``;
  const reservedChars = footerText.length + 50;
  let totalTextLength = 0;

  const clonedContainer = JSON.parse(JSON.stringify(message.components[0] || {}));
  const editedContainer = new ContainerBuilder({
    accent_color: color,
  });

  if (clonedContainer.components) {
    for (const component of clonedContainer.components) {
      if (component.type === 9) {
        let content = component.components[0].content;
        content = content.replace(/<@&\d+>/g, "").trim();

        const fullContent = content + statusSuffix;
        const available = MAX_DISPLAYABLE_TEXT - totalTextLength - reservedChars;
        const truncatedContent = available < fullContent.length
          ? fullContent.slice(0, Math.max(available - 3, 0)) + "..."
          : fullContent;

        totalTextLength += truncatedContent.length;

        editedContainer.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder({
                content: truncatedContent,
              }),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder({
                media: { url: component.accessory.media.url },
              }),
            ),
        );
      } else if (component.type === 10) {
        const available = MAX_DISPLAYABLE_TEXT - totalTextLength - reservedChars;
        if (available <= 0) continue;

        const content = available < component.content.length
          ? component.content.slice(0, Math.max(available - 3, 0)) + "..."
          : component.content;

        totalTextLength += content.length;

        editedContainer.addTextDisplayComponents(
          new TextDisplayBuilder({
            content: content,
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
      } else if (component.type === 13) {
        if (component.file?.url?.startsWith('attachment://')) {
          editedContainer.addFileComponents(
            new FileBuilder().setURL(component.file.url),
          );
        }
      }
    }
  }

  editedContainer.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: footerText,
    }),
  );

  return editedContainer;
}

function createLeftV2Component(message, memberId) {
  const MAX_DISPLAYABLE_TEXT = 4000;
  const color = StatusColors[VerificationStatus.LEFT];

  const footerText = `-# User left server (${memberId})`;
  const statusSuffix = `\n**Status:** \`Left Server\``;
  const reservedChars = footerText.length + 50;
  let totalTextLength = 0;

  const clonedContainer = JSON.parse(
    JSON.stringify(message.components[0] || {}),
  );
  const editedContainer = new ContainerBuilder({
    accent_color: color,
  });

  if (clonedContainer.components) {
    for (const component of clonedContainer.components) {
      if (component.type === 9) {
        let content = component.components[0].content;
        content = content.replace(/<@&\d+>/g, "").trim();

        const fullContent = content + statusSuffix;
        const available = MAX_DISPLAYABLE_TEXT - totalTextLength - reservedChars;
        const truncatedContent = available < fullContent.length
          ? fullContent.slice(0, Math.max(available - 3, 0)) + "..."
          : fullContent;

        totalTextLength += truncatedContent.length;

        editedContainer.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder({
                content: truncatedContent,
              }),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder({
                media: { url: component.accessory.media.url },
              }),
            ),
        );
      } else if (component.type === 10) {
        const available = MAX_DISPLAYABLE_TEXT - totalTextLength - reservedChars;
        if (available <= 0) continue;

        const content = available < component.content.length
          ? component.content.slice(0, Math.max(available - 3, 0)) + "..."
          : component.content;

        totalTextLength += content.length;

        editedContainer.addTextDisplayComponents(
          new TextDisplayBuilder({
            content: content,
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
          const mappedurls = component.items.map((item) => ({
            media: { url: item.media.url },
          }));
          editedContainer.addMediaGalleryComponents(
            new MediaGalleryBuilder({
              items: mappedurls,
            }),
          );
        }
      } else if (component.type === 13) {
        if (component.file?.url?.startsWith("attachment://")) {
          editedContainer.addFileComponents(
            new FileBuilder().setURL(component.file.url),
          );
        }
      }
    }
  }

  editedContainer.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: footerText,
    }),
  );

  return editedContainer;
}

function createDisabledButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify")
      .setLabel("Accept")
      .setStyle("Success")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("deny")
      .setLabel("Deny")
      .setStyle("Danger")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("reasondeny")
      .setLabel("Deny with reason")
      .setStyle("Danger")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("question")
      .setLabel("Question")
      .setStyle("Primary")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("action")
      .setLabel("Kick")
      .setStyle("Secondary")
      .setDisabled(true),
  );
}

// Process text placeholders for welcome messages
async function processText(text, user, interaction, originalEmbed, verifiedRoles, appName = null) {
  if (!text) return null;

  if (
    text.toLowerCase().includes("{q") &&
    interaction.message?.flags?.has(MessageFlags.IsComponentsV2)
  ) {
    const regex = /\{q[0-9]\}/gi;
    const matches = text.match(regex);

    if (matches) {
      matches.forEach((match) => {
        const questionNumber = parseInt(match.slice(2, -1));
        const component = interaction.message.components[0]?.components?.find(c => c.data?.content?.startsWith(`**${questionNumber}.**`))

        if (component && component.content) {
          const answer = component.content.split("_ _")[1]?.trim() || "";
          text = text.replace(new RegExp(match, "gi"), answer);
        } else {
          text = text.replace(new RegExp(match, "gi"), "");
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
  text = text.replace(/{appName}/gi, appName);

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
async function sendWelcomeMessage(interaction, user, welcomeChannel, welcomeMessage, originalEmbed, verifiedRoles, application) {
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
    const textImage = resolveImage(welcomeMessage.image);

    const finalmessage = { content: finalText };

    if (textImage.embedUrl) {
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

    const imageAsset = resolveImage(welcomeMessage.image);

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

    if (application.branding_enabled === true) {
      const webhook = await GuildWebhook.findOne({ where: { channel_id: channel.id } });
      if (webhook) {
        try {
          const webhookData = decryptData(String(webhook.encrypted_token));
          if (!webhookData || !webhookData.id || !webhookData.token) {
            throw new Error(`Invalid webhook data for channel ${webhook.channel_id}`);
          }

          const client = new WebhookClient({
            id: webhookData.id,
            token: webhookData.token
          });

          const name = application.custom_name || "Melpo Verifier";
          const avatarURL = application.custom_avatar_url || null;
          await client.send({
            username: name,
            avatarURL: avatarURL,
            content: messageContent || null,
            embeds: [welcomeEmbed],
          });
          return;
        } catch (error) {
          interaction.followUp({
            content: `Welcome channel webhook error: ${error.message}`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => { });
          console.error("Error sending welcome webhook:", error.message);
        }
      }
    }

    await channel.send({
      content: messageContent || null,
      embeds: [welcomeEmbed],
    });
  }
}

// Send verification DM to user
async function sendVerifyDM(user, application, interaction, verifiedRoles) {
  if (!application.verifymessage) return;

  const { title, description, color, image } = application.verifymessage;

  const finalTitle = await processText(title, user, interaction, null, verifiedRoles, application.name);
  const finalDescription = await processText(description, user, interaction, null, verifiedRoles, application.name);
  const dmImage = resolveImage(image);

  const finalEmbed = new EmbedBuilder()
    .setTitle(finalTitle ?? null)
    .setDescription(finalDescription)
    .setColor(color ?? null)
    .setImage(dmImage.embedUrl);

  await user.send({
    embeds: [finalEmbed],
  }).catch(() => { });
}

// Send denial DM to user
async function sendDenyDM(modname, user, application, guildName, reason = null) {
  const description = application.denymessage?.description
    ? application.denymessage.description
      .replace(/{modname}/gi, modname)
      .replace(/\${interaction.guild.name}/gi, guildName)
      .replace(/{appName}/gi, application.name)
    : `Your application into **${guildName}** has been denied.`;
  const denyEmbed = new EmbedBuilder()
    .setColor(application.denymessage?.color || "#EB2121")
    .setTitle(application.denymessage?.title || "Application Denied")
    .setDescription(description + `${reason ? `\n**Reason:** ${reason}` : ""}`)
  // .setDescription(
  //   `Your application into **${guildName}** has been denied!\n**Reason:** ${reason || "none given"}`,
  // );

  try {
    await user.send({ embeds: [denyEmbed] });
    return { success: true };
  } catch (error) {
    if (error.code === 50007 || error.code === 50278) {
      return { success: false, dmDisabled: true };
    }
    throw error;
  }
}

// Send kick DM to user
async function sendKickDM(user, guildName, reason = null) {
  const kickEmbed = new EmbedBuilder()
    .setColor("#EB2121")
    .setTitle(`Kicked from ${guildName}`)
    .setDescription(`You've been kicked from ${guildName}${reason ? `\n**Reason:** ${reason}` : ""}`);

  try {
    await user.send({ embeds: [kickEmbed] });
    return { success: true };
  } catch (error) {
    if (error.code === 50007 || error.code === 50278) {
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
    reason = null,
    useRateLimiting = false,
  } = options;

  const hasSeparateLogChannel =
    application.verifylogs &&
    messageids &&
    application.reviewchannel !== application.verifylogs;

  if (hasSeparateLogChannel) {
    const reviewChannel = interaction.guild.channels.cache.get(application.reviewchannel);
    const logChannel = interaction.guild.channels.cache.get(application.verifylogs);

    if (logChannel && reviewChannel && messageids && messageids.length > 0) {
      const botMember = interaction.guild.members.me ?? await logChannel.guild.members.fetchMe();
      const botPermissions = logChannel.permissionsFor(botMember);
      if (
        !botPermissions ||
        !botPermissions.has([
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ViewChannel,
        ])
      ) {
        return await interaction.channel.send({
          content: `<@${user.id}>, I don't have permissions to send messages in the verification review channel!`,
        });
      }

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

      let webhookClient = null;
      if (application.branding_enabled) {
        const webhookRecord = await GuildWebhook.findOne({
          where: { channel_id: logChannel.id },
        });

        if (webhookRecord) {
          try {
            const webhookData = decryptData(String(webhookRecord.encrypted_token));
            webhookClient = new WebhookClient({
              id: webhookData.id,
              token: webhookData.token,
            });
          } catch (e) {
            console.error("Failed to decrypt webhook token:", e);
          }
        }
      }

      for (const message of messages) {
        if (!useRateLimiting) await new Promise((resolve) => setTimeout(resolve, 600));

        try {
          if (message.flags?.has(MessageFlags.IsComponentsV2)) {
            const { container: preparedContainer, files } = relinkAttachments(message);
            const tempMsg = { ...message, components: [preparedContainer] };
            const editedContainer = handleV2Edit(interaction, tempMsg, status, reason);

            const sendPayload = {
              flags: [MessageFlags.IsComponentsV2],
              components: [editedContainer],
              files: files || [],
            };

            let threadEmbed;
            if (message.thread) {
              threadEmbed = await createThreadSummary(message.thread, client, status);
            }

            // const sendOp = async () => {
            //   const payload = {
            //     flags: [MessageFlags.IsComponentsV2],
            //     components: [editedContainer],
            //   };
            //   if (files) {
            //     payload.files = files;
            //   }
            //   return logChannel.send(payload);
            // };

            // const sendmessage = useRateLimiting
            //   ? await rateLimitedOperation(sendOp)
            //   : await sendOp();
            let sentMessage;
            if (webhookClient) {
              // Webhooks use the user's branding
              sentMessage = await webhookClient.send({
                ...sendPayload,
                username: application.custom_name || client.user.username,
                avatarURL: application.custom_avatar_url || client.user.displayAvatarURL(),
              });
            } else {
              // Normal bot message fallback
              const sendOp = async () => logChannel.send(sendPayload);
              sentMessage = useRateLimiting ? await rateLimitedOperation(sendOp) : await sendOp();
            }

            // const threadOp = async () =>
            //   sendmessage.startThread({
            //     name: `${user.user?.username || user.username}'s log`,
            //   });

            // const threadchannel = useRateLimiting
            //   ? await rateLimitedOperation(threadOp)
            //   : await threadOp();

            const messageToThread = webhookClient
              ? await logChannel.messages.fetch(sentMessage.id)
              : sentMessage;

            const threadOp = async () => messageToThread.startThread({
              name: `${user.user?.username || user.username}'s log`,
            });

            const threadchannel = useRateLimiting ? await rateLimitedOperation(threadOp) : await threadOp();

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
          }
        } catch (error) {
          console.error("Error processing log message:", error);
        }
      }
    }
  } else {
    if (messageids && messageids.length > 0) {

      let webhookClient = null;
      if (application.branding_enabled) {
        const webhookRecord = await GuildWebhook.findOne({
          where: { channel_id: interaction.channelId },
        });
        if (webhookRecord) {
          const webhookData = decryptData(String(webhookRecord.encrypted_token));
          webhookClient = new WebhookClient({ id: webhookData.id, token: webhookData.token });
        }
      }

      for (const messageId of messageids) {
        // Skip the current message if being handled separately
        if (messageId === interaction.message?.id) continue;

        try {
          const fetchOp = async () => interaction.channel.messages.fetch(messageId);
          const message = useRateLimiting
            ? await rateLimitedOperation(fetchOp)
            : await fetchOp();

          if (!useRateLimiting) await new Promise((resolve) => setTimeout(resolve, 1000));

          if (message) {
            const isWebhookMessage = !!message.webhookId;

            if (message.flags?.has(MessageFlags.IsComponentsV2)) {
              const editedContainer = handleV2Edit(interaction, message, status, reason);
              const payload = {
                flags: [MessageFlags.IsComponentsV2],
                components: [editedContainer],
              }
              // const editOp = async () =>
              //   message.edit({
              //     flags: [MessageFlags.IsComponentsV2],
              //     components: [editedContainer],
              //   });
              // useRateLimiting ? await rateLimitedOperation(editOp) : await editOp();
              if (isWebhookMessage && webhookClient) {
                // If it's a webhook message, we MUST use the webhook client to edit
                await webhookClient.editMessage(message.id, payload);
              } else {
                // Normal bot message edit
                const editOp = async () => message.edit(payload);
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

async function processLeaveMessages(options) {
  const { client, member, application, messageIds } = options;

  const reviewChannel = member.guild.channels.cache.get(application.reviewchannel);
  if (!reviewChannel) return;

  const hasSeparateLogChannel =
    application.verifylogs && application.verifylogs !== application.reviewchannel;

  for (const messageId of messageIds) {
    await new Promise((resolve) => setTimeout(resolve, 300));

    let foundMessage;
    try {
      foundMessage = await reviewChannel.messages.fetch(messageId);
    } catch (error) {
      if (error.code === 10008) continue;
      console.error(`Error fetching message ${messageId}:`, error);
      continue;
    }

    if (!foundMessage) continue;

    try {
      if (hasSeparateLogChannel) {
        const logChannel =
          member.guild.channels.cache.get(application.verifylogs);

        if (
          logChannel &&
          foundMessage.flags?.has(MessageFlags.IsComponentsV2)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 300));

          const { container, files } = relinkAttachments(foundMessage);
          const tempMsg = { ...foundMessage, components: [container] };
          const leftContainer = createLeftV2Component(tempMsg, member.id);

          let threadEmbed;
          if (foundMessage.thread) {
            threadEmbed = await createThreadSummary(
              foundMessage.thread,
              client,
              VerificationStatus.LEFT,
            );
          }

          const payload = {
            flags: [MessageFlags.IsComponentsV2],
            components: [leftContainer],
          };
          if (files) payload.files = files;

          const sentMessage = await logChannel.send(payload);

          const thread = await sentMessage.startThread({
            name: `${member.user?.username || member.id}'s log`,
          });

          if (threadEmbed) {
            await thread.send({ embeds: [threadEmbed] });
          }
          await thread.setArchived(true);

          if (foundMessage.thread) {
            await foundMessage.thread.delete().catch(console.error);
          }
          await foundMessage.delete().catch(console.error);
        }
      } else {
        if (
          foundMessage.author.id === client.user.id &&
          foundMessage.flags?.has(MessageFlags.IsComponentsV2)
        ) {
          const { container, files } = relinkAttachments(foundMessage);
          const tempMsg = { ...foundMessage, components: [container] };
          const leftContainer = createLeftV2Component(tempMsg, member.id);
          const disabledButtons = createDisabledButtons();

          const editPayload = {
            flags: [MessageFlags.IsComponentsV2],
            components: [leftContainer, disabledButtons],
          };
          if (files) editPayload.files = files;

          await foundMessage.edit(editPayload);

          if (foundMessage.thread) {
            await foundMessage.thread.setArchived(true);
          }
        }
      }
    } catch (error) {
      console.error("Error processing log message:", error);
    }
  }
}

// Clean up verification data from database
async function cleanupVerificationData(verification, guildId, memberId, applicationId = null) {


  const guildData = verification?.guildVerifications?.[guildId];
  if (!guildData) return;

  if (applicationId != null && !Array.isArray(guildData)) {

    await Submissions.destroy({
      where: { user_id: memberId, app_id: String(applicationId), status: { [Op.not]: "denied" } },
    }).catch((e) => { console.error("Error deleting submission:", e); });
    delete guildData[applicationId];
    if (Object.keys(guildData).length === 0) {
      delete verification.guildVerifications[guildId];
    }
  } else {
    delete verification.guildVerifications[guildId];
    //destroy if status isn't "denied"
    await Submissions.destroy({
      where: { user_id: memberId, guild_id: guildId, status: { [Op.not]: "denied" } },
    }).catch((e) => { console.error("Error deleting submission:", e); });
  }

  verification.changed("guildVerifications", true);
  await verification.save();
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
  await applyRoles(user, verifiedRoles, unverifiedRoles, interaction);

  // Get verification data
  const verification = await Verification.findOne({ where: { userId } });
  const messageids = getMessageIds(verification, interaction.guild.id, application.id);
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
    await cleanupVerificationData(verification, interaction.guild.id, userId, application.id);
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
  const messageids = getMessageIds(verification, interaction.guild.id, application.id);
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
    await cleanupVerificationData(verification, interaction.guild.id, userId, application.id);
  }

  // Send deny DM
  const dmResult = await sendDenyDM(interaction.user.username, user, application, interaction.guild.name, reason);

  return { success: true, user, dmDisabled: dmResult.dmDisabled };
}

function relinkAttachments(message) {
  const container = JSON.parse(JSON.stringify(message.components?.[0] || {}));
  const comps = container.components || [];

  const fileComp = comps[comps.length - 1];
  if (!fileComp?.file?.url) {
    return { container, files: null };
  }

  const url = fileComp.file.url;
  const name =
    fileComp.file.name || url.split('/').pop().split('?')[0];

  if (!url.startsWith('attachment://')) {
    fileComp.file.url = `attachment://${name}`;
    return {
      container,
      files: [new AttachmentBuilder(url, { name })],
    };
  }

  return { container, files: null };
}

module.exports = {
  VerificationStatus,
  StatusColors,
  rateLimitedOperation,
  checkManagerPermission,
  isInReviewChannel,
  validateRoles,
  applyRoles,
  createAutoActionContainer,
  handleV2Edit,
  relinkAttachments,
  processText,
  getMentions,
  getMessageIds,
  addMessageId,
  sendWelcomeMessage,
  sendVerifyDM,
  sendDenyDM,
  sendKickDM,
  createThreadSummary,
  processLogMessages,
  processLeaveMessages,
  cleanupVerificationData,
  createNoApplicationEmbed,
  verifyUser,
  denyUser,
};

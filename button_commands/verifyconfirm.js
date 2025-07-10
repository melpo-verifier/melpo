const {
  ButtonBuilder,
  ActionRowBuilder,
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
const { ServerConfig, Verification } = require("../dbObjects.js");

module.exports = async ({ interaction, client, userid, context }) => {
  await interaction.deferUpdate();

  const originaluserid = context[0]?.toString();
  if (originaluserid && originaluserid !== interaction.user.id) {
    return await interaction.followUp({
      content: "This verification is already handled by another user!",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!userid) {
    throw new Error("Could not fetch user ID from the embed");
  }

  const disverify = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify")
      .setLabel("Verify")
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

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  if (serverConfig && Array.isArray(serverConfig.managerrole)) {
    // Check if interaction user has any of the manager roles
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = serverConfig.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return await interaction.followUp({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${serverConfig.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const unverifiedRoles = serverConfig.unverifiedrole;
  const verifiedRoles = serverConfig.verifiedrole;
  const welcomeMessage = serverConfig.verificationwelcomemessage;
  const welcomeChannel = serverConfig.verificationwelcomechannel;

  const originalembedlast = interaction.message.embeds[0];

  if (verifiedRoles && verifiedRoles.length > 0) {
    for (const roleId of verifiedRoles) {
      const role = await interaction.guild.roles.fetch(roleId);
      if (!role) {
        return await interaction.followUp(
          `Verified role with ID ${roleId} not found, please make sure the role still exists and that I have access to it! If not, please reconfigure the verifiedroles in setup.`,
        );
      }
      if (
        interaction.guild.members.me.roles.highest.comparePositionTo(role) < 0
      ) {
        return await interaction.followUp({
          content: `My highest role is not higher than <@&${roleId}>, please move my role higher than the verified role.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  } else {
    return await interaction.followUp({
      content:
        "No verified role set up, please set up a verified role using the `/setup` command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (unverifiedRoles && unverifiedRoles.length > 0) {
    for (const roleId of unverifiedRoles) {
      const role = await interaction.guild.roles.fetch(roleId);
      if (!role) {
        return await interaction.followUp(
          `Unverified role with ID ${roleId} not found, please make sure the role still exists and that I have access to it! If not, please reconfigure the verifiedroles in setup.`,
        );
      }
      if (
        interaction.guild.members.me.roles.highest.comparePositionTo(role) < 0
      ) {
        return await interaction.followUp({
          content: `My highest role is not higher than <@&${roleId}>, please move my role higher than the unverified role.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  }

  let user;
  try {
    user = await interaction.guild.members.fetch(userid);
    if (!user) {
      throw new Error("User not found");
    }
  } catch {
    await interaction.followUp({
      content:
        "User not found in server. This user has probably left this server.\nIf you believe this is an error, please contact the developer.\nYou can always verify someone manually using `/verify`",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Remove unverified roles
  if (unverifiedRoles !== null) {
    for (const role of unverifiedRoles) {
      await user.roles.remove(role);
    }
  }

  // Add verified roles
  for (const role of verifiedRoles) {
    await user.roles.add(role);
  }

  //disable buttons
  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    const originalContainer = interaction.message.components[0];
    await interaction.editReply({ components: [originalContainer, disverify] });
  } else {
    await interaction.editReply({ components: [disverify] });
  }

  //send welcome message
  if (welcomeChannel !== null && welcomeMessage !== null) {
    const channel = interaction.guild.channels.cache.get(welcomeChannel);

    if (!channel) {
      return await interaction.followUp(
        `Welcome channel ${welcomeChannel} not found, make sure that the channel still exists and that I have access to the channel and all required permissions! To change the welcome channel, use the \`/setup\` command.`,
      );
    }

    const getMentions = (content) => {
      if (!content) return "";
      const userMentions = content.match(/<@!?(\d+)>/g) || [];
      const roleMentions = content.match(/<@&(\d+)>/g) || [];
      const uniqueUserMentions = new Set(userMentions);
      const uniqueRoleMentions = new Set(roleMentions);
      return `${Array.from(uniqueUserMentions).join(" ")} ${Array.from(uniqueRoleMentions).join(" ")}`.trim();
    };

    if (welcomeMessage.text) {
      const finalText = await processText(
        welcomeMessage.text,
        user,
        interaction,
        originalembedlast,
        verifiedRoles,
      );

      if (welcomeMessage.image) {
        try {
          const attachment = new AttachmentBuilder(
            welcomeMessage.image,
          ).setName(`welcomemessage.${welcomeMessage.image.split(".").pop()}`);
          await channel.send({
            content: finalText,
            files: [attachment],
          });
        } catch {
          interaction.followUp({
            content: `Error sending welcome message with image, sending without image.`,
            flags: MessageFlags.Ephemeral,
          });
          await channel.send({
            content: finalText,
          });
        }
      } else {
        await channel.send({ content: finalText });
      }
    } else {
      const finalTitle = welcomeMessage.title
        ? await processText(
            welcomeMessage.title,
            user,
            interaction,
            originalembedlast,
            verifiedRoles,
          )
        : null;
      const finalDescription = welcomeMessage.description
        ? await processText(
            welcomeMessage.description,
            user,
            interaction,
            originalembedlast,
            verifiedRoles,
          )
        : null;
      const messageContent = getMentions(finalDescription);

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(finalTitle && finalTitle.trim() ? finalTitle : null)
        .setDescription(finalDescription)
        .setColor(welcomeMessage.color ?? "#3f7ff1")
        .setImage(
          welcomeMessage.image
            ? `attachment://welcomemessage.${welcomeMessage.image.split(".").pop()}`
            : null,
        );

      if (welcomeMessage.image) {
        welcomeEmbed.setAuthor({
          name: user.user.globalName ?? user.user.username,
          iconURL: user.user.displayAvatarURL({ dynamic: true, size: 128 }),
        });
      } else {
        welcomeEmbed.setThumbnail(
          user.user.displayAvatarURL({ dynamic: true, size: 512 }),
        );
      }

      channel.send({
        content: messageContent || null,
        embeds: [welcomeEmbed],
        files: welcomeMessage.image
          ? [
              new AttachmentBuilder(welcomeMessage.image).setName(
                `welcomemessage.${welcomeMessage.image.split(".").pop()}`,
              ),
            ]
          : [],
      });
    }
  }

  const verification = await Verification.findOne({
    where: { userId: userid },
  });
  const messageids = verification?.guildVerifications?.[interaction.guild.id];

  if (
    serverConfig.verifylogs &&
    messageids &&
    serverConfig.reviewchannel !== serverConfig.verifylogs
  ) {
    const reviewChannel = interaction.guild.channels.cache.get(
      serverConfig.reviewchannel,
    );
    const logChannel = interaction.guild.channels.cache.get(
      serverConfig.verifylogs,
    );

    if (logChannel && reviewChannel && messageids) {
      const messages = [];
      for (const messageId of messageids) {
        try {
          const message = await reviewChannel.messages.fetch(messageId);
          if (message) messages.push(message);
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          if (error.code === 10008) {
            console.log(`Message ${messageId} not found - skipping`);
            continue;
          }
          throw error;
        }
      }

      // Sort by timestamp
      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      // Send modified embeds to logs and delete from review
      for (const message of messages) {
        await new Promise((resolve) => setTimeout(resolve, 600));

        try {
          if (message.flags.has(MessageFlags.IsComponentsV2)) {
            const verifiedContainer = await handleV2edit(interaction, message);

            let threadEmbed;

            if (message.thread) {
              threadEmbed = new EmbedBuilder()
                .setTitle(`Thread Summary`)
                .setColor("#008000");

              try {
                const threadMessages = await message.thread.messages.fetch();

                if (threadMessages.size > 1) {
                  const messagesArray = Array.from(threadMessages.values())
                    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                    .slice(1);

                  const formattedMessages = messagesArray?.map((msg) => {
                    let content;

                    if (msg.flags.has(MessageFlags.IsComponentsV2)) {
                      content =
                        msg.components?.[0]?.components?.[0]?.content ||
                        "No content";
                    } else {
                      content = msg.content || "No content";
                    }

                    if (msg.author.id === client.user.id) {
                      content = content?.replace(
                        /### Question answered by[^\n]*\n?/g,
                        "\n",
                      );
                    }

                    return `\`${msg.author.username}:\` ${content}`;
                  });

                  const finalContent = formattedMessages
                    .join("\n")
                    .slice(0, 4096);
                  threadEmbed.setDescription(
                    finalContent || "No messages in thread",
                  );
                } else {
                  threadEmbed.setDescription(
                    "No additional messages in thread",
                  );
                }
              } catch (error) {
                console.error("Error fetching thread messages:", error);
                threadEmbed.setDescription("Error loading thread messages");
              }
            }

            const sendmessage = await logChannel.send({
              flags: [MessageFlags.IsComponentsV2],
              components: [verifiedContainer],
            });

            const threadchannel = await sendmessage.startThread({
              name: `${user.user.username}'s log`,
            });

            if (threadEmbed) {
              await threadchannel.send({ embeds: [threadEmbed] });
            }
            await threadchannel.setArchived(true);

            if (message.thread) {
              await message.thread.delete().catch(console.error);
            }

            await message.delete().catch(console.error);
          } else {
            const originalembed = message.embeds[0];

            const Embed = new EmbedBuilder(originalembed)
              .setColor("#008000")
              .setTitle(originalembed.title + " (VERIFIED)")
              .setFooter({
                text: `Verified by ${interaction.user.username} | ${originalembed?.footer?.text || userid}`,
              });

            await logChannel.send({ content: `<@${userid}>`, embeds: [Embed] });
            await message.delete().catch(console.error);
          }
        } catch (error) {
          console.error(`Error processing log message:`, error);
        }
      }
    }
  } else {
    if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
      const verifiedContainer = await handleV2edit(
        interaction,
        interaction.message,
      );

      await interaction.editReply({
        flags: [MessageFlags.IsComponentsV2],
        components: [verifiedContainer],
      });

      if (interaction.message.thread) {
        await interaction.message.thread.setArchived(true);
      }
    } else {
      const originalEmbed = interaction.message.embeds[0];
      let fields = originalEmbed.fields || [];

      // Remove confirmation field
      if (
        fields.length > 0 &&
        fields[fields.length - 1].name.includes("Are you sure")
      ) {
        fields.pop();
      }

      const embed = new EmbedBuilder(originalEmbed)
        .setColor("#008000")
        .setTitle(originalEmbed.title + " (VERIFIED)")
        .setFields(fields)
        .setFooter({
          text: `Verified by ${interaction.user.username} | ${originalEmbed?.footer?.text || userid}`,
        });

      await interaction.editReply({ embeds: [embed], components: [] });
    }

    if (messageids && messageids.length > 0) {
      for (const messageId of messageids) {
        if (messageId === interaction.message.id) {
          continue;
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          // Add a 1-second delay to prevent ratelimiting
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (message && message.author.id === client.user.id) {
            if (message.flags.has(MessageFlags.IsComponentsV2)) {
              const verifiedContainer = await handleV2edit(
                interaction,
                message,
              );
              await message.edit({
                flags: [MessageFlags.IsComponentsV2],
                components: [verifiedContainer],
              });
            } else if (
              !message?.embeds[0]?.footer?.text?.includes("Verified")
            ) {
              const originalembed = message.embeds[0];

              const Embed = new EmbedBuilder(originalembed)
                .setColor("#008000")
                .setTitle(originalembed.title + " (VERIFIED)")
                .setFooter({
                  text: `Verified by ${interaction.user.username} | ${originalembed?.footer?.text || userid}`,
                });

              await message.edit({ embeds: [Embed], components: [] });
            }
          }
        } catch (error) {
          console.error(
            `Failed to process message with ID ${messageId}: ${error}`,
          );
        }
      }
    }
  }

  //delete the messages from verifications table
  if (messageids && messageids.length > 0) {
    delete verification.guildVerifications[interaction.guild.id];
    verification.changed("guildVerifications", true);
    await verification.save();
  }

  const title = serverConfig.verifymessage.title;
  const description = serverConfig.verifymessage.description;
  const color = serverConfig.verifymessage.color;
  const image = serverConfig.verifymessage.image;

  const finalTitle = await processText(
    title,
    user,
    interaction,
    originalembedlast,
    verifiedRoles,
  );
  const finalDescription = await processText(
    description,
    user,
    interaction,
    originalembedlast,
    verifiedRoles,
  );

  const finalEmbed = new EmbedBuilder()
    .setTitle(finalTitle && finalTitle.trim() ? finalTitle : null)
    .setDescription(finalDescription)
    .setColor(color)
    .setImage(
      image ? `attachment://verifymessage.${image.split(".").pop()}` : null,
    );

  try {
    await user.send({
      embeds: [finalEmbed],
      files: image
        ? [
            new AttachmentBuilder(image).setName(
              `verifymessage.${image.split(".").pop()}`,
            ),
          ]
        : [],
    });
  } catch (error) {
    if (error.code === 50007) {
      await interaction.followUp({
        content: `✅ User verified successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      throw error;
    }
  }
};

async function processText(
  text,
  user,
  interaction,
  originalembedlast,
  verifiedRoles,
) {
  if (!text) return null;

  if (text.toLowerCase().includes("{q") && originalembedlast) {
    const regex = /\{q[0-9]\}/gi;
    const matches = text.match(regex);

    if (matches) {
      matches.forEach((match) => {
        const questionNumber = match.slice(2, -1);
        const field = originalembedlast.fields?.find((field) =>
          field.value.startsWith(`**${questionNumber}.**`),
        );

        if (field) {
          const answer =
            field.value.split("_ _")[1]?.trim() || "No answer provided";
          text = text?.replace(new RegExp(match, "gi"), answer);
        }
      });
    }
  } else if (
    text.toLowerCase().includes("{q") &&
    interaction.message.flags.has(MessageFlags.IsComponentsV2)
  ) {
    const regex = /\{q[0-9]\}/gi;
    const matches = text.match(regex);

    if (matches) {
      matches.forEach((match) => {
        const questionNumber = parseInt(match.slice(2, -1));
        const component =
          interaction.message.components[0]?.components[questionNumber + 1];

        if (component && component.content) {
          const answer =
            component.content.split("_ _")[1]?.trim() || "No answer provided";
          text = text?.replace(new RegExp(match, "gi"), answer);
        }
      });
    }
  } else if (text.toLowerCase().includes("{q")) {
    text = text?.replace(/{q[0-9]}/gi, "");
  }

  text = text?.replace(
    /{username}/gi,
    user.user.globalName ?? user.user.username,
  );
  text = text?.replace(/{usermention}/gi, `<@${user.id}>`);
  text = text?.replace(/{members}/gi, interaction.guild.memberCount);

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
      });
    text = text?.replace(/{verifiedmembers}/gi, verifiedMembers);
  }

  text = text?.replace(
    /{modname}/gi,
    interaction.user.globalName ?? interaction.user.username,
  );
  text = text?.replace(/\${interaction.guild.name}/gi, interaction.guild.name);

  return text && text.trim() ? text : null;
}

async function handleV2edit(interaction, message) {
  const verifiedContainer = new ContainerBuilder({
    accent_color: 0x008000,
  });

  const originalContainer = message.components[0];

  if (originalContainer?.components) {
    for (const component of originalContainer.components) {
      if (component.type === 9) {
        let content = component.components[0].content;

        content = content.replace(/<@&\d+>/g, "").trim();

        verifiedContainer.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder({
                content:
                  content +
                  `\n**Status:** \`Verified by ${interaction.user.username}\``,
              }),
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder({
                media: { url: component.accessory.media.url },
              }),
            ),
        );
      }
      if (component.type === 10) {
        verifiedContainer.addTextDisplayComponents(
          new TextDisplayBuilder({
            content: component.content,
          }),
        );
      } else if (component.type === 14) {
        verifiedContainer.addSeparatorComponents(
          new SeparatorBuilder({
            spacing: component.spacing || SeparatorSpacingSize.Small,
          }),
        );
      } else if (component.type === 12) {
        if (component.items?.length > 0) {
          const mappedurls = component.items?.map((item) => ({
            media: {
              url: item.media.url,
            },
          }));
          verifiedContainer.addMediaGalleryComponents(
            new MediaGalleryBuilder({
              items: mappedurls,
            }),
          );
        }
      }
    }
  }

  verifiedContainer.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: `-# Verified by ${interaction.user.username} (${interaction.user.id})`,
    }),
  );

  return verifiedContainer;
}

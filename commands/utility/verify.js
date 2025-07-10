const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionsBitField,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require("discord.js");
const {
  ServerConfig,
  Verification,
  InviteTracker,
} = require("../../dbObjects.js");

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
        // Message not found - don't retry
        throw error;
      } else if (error.code === 50001 || error.code === 50013) {
        // Missing permissions - don't retry
        throw error;
      } else {
        // Other errors - retry once
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("verifies (multiple) people")
    .setContexts(0)
    .addStringOption((option) =>
      option
        .setName("users")
        .setDescription(
          "The users to verify (mention them or provide their IDs)",
        )
        .setRequired(true),
    ),
  async execute({ interaction, client }) {
    const serverConfig = await ServerConfig.findOne({
      where: { server_id: interaction.guild.id },
    });

    // Permission checks
    if (serverConfig && Array.isArray(serverConfig.managerrole)) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const hasManagerRole = serverConfig.managerrole.some((role) =>
        member.roles.cache.has(role),
      );

      if (!hasManagerRole) {
        return interaction.reply({
          content: `You do not have permission to manage verifications. You need one of the following roles: ${serverConfig.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } else if (
      serverConfig &&
      serverConfig.reviewchannel &&
      interaction.channel.id !== serverConfig.reviewchannel
    ) {
      return interaction.reply({
        content: `Please use this command in <#${serverConfig.reviewchannel}> or set up a manager role in \`/setup\` to use this command everywhere.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!serverConfig?.verifiedrole || serverConfig.verifiedrole.length === 0) {
      return interaction.reply({
        content:
          "Please set a verified role in the server configuration by using the `/setup` command",
        flags: MessageFlags.Ephemeral,
      });
    }

    const usersString = interaction.options.getString("users");
    const userMentions = usersString.match(/<@!?(\d+)>/g) || [];
    const userIds = usersString.match(/\b\d{17,19}\b/g) || [];

    // Combine both mentions and IDs
    const allUserIds = [
      ...new Set([
        ...(userMentions
          ? userMentions.map((mention) => mention.replace(/[<@!>]/g, ""))
          : []),
        ...userIds,
      ]),
    ];

    if (allUserIds.length === 0) {
      return interaction.reply({
        content: "No valid user mentions or IDs found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const users = allUserIds
      ?.map((id) => interaction.guild.members.cache.get(id))
      .filter((user) => user);

    if (users.length === 0) {
      return interaction.reply({
        content: "No valid users found in the guild.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (users.some((user) => user.user.bot)) {
      return interaction.reply({
        content: "You cannot verify a bot.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const unverifiedRoles = serverConfig.unverifiedrole;
    const verifiedRoles = serverConfig.verifiedrole;
    const welcomeMessage = serverConfig.verificationwelcomemessage;
    const welcomeChannel = serverConfig.verificationwelcomechannel;

    if (
      !interaction.guild.members.me.permissions.has(
        PermissionsBitField.Flags.ManageRoles,
      )
    ) {
      return interaction.reply({
        content: "I do not have the required permissions to manage roles",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (verifiedRoles && verifiedRoles.length > 0) {
      for (const roleId of verifiedRoles) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          return interaction.reply({
            content: `Verified role with ID ${roleId} not found. Please update your server configuration.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (
          interaction.guild.members.me.roles.highest.comparePositionTo(role) <=
          0
        ) {
          return interaction.reply({
            content: `I cannot assign the role ${role.name} because it's higher than or equal to my highest role.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    if (unverifiedRoles && unverifiedRoles.length > 0) {
      for (const roleId of unverifiedRoles) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (
          role &&
          interaction.guild.members.me.roles.highest.comparePositionTo(role) <=
            0
        ) {
          return interaction.reply({
            content: `I cannot remove the role ${role.name} because it's higher than or equal to my highest role.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    await interaction.reply(`Verifying ${users.length} user(s)...`);

    const results = {
      success: [],
      notFound: [],
    };

    for (const userID of allUserIds) {
      try {
        // Check if user is still in server
        const user = await interaction.guild.members.fetch(userID);
        if (!user) {
          throw new Error("User not found");
        }

        // Remove unverified roles
        if (unverifiedRoles && unverifiedRoles.length > 0) {
          for (const roleId of unverifiedRoles) {
            await user.roles.remove(roleId).catch(console.error);
          }
        }

        // Add verified roles
        for (const roleId of verifiedRoles) {
          await user.roles.add(roleId).catch(console.error);
        }

        results.success.push(userID);

        const verification = await Verification.findOne({
          where: { userId: userID },
        });
        const messageids =
          verification?.guildVerifications?.[interaction.guild.id] || [];
        const invitetracker = await InviteTracker.findOne({
          where: { unique_id: `${userID}_${interaction.guild.id}` },
        });

        // if log channel is setup
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

          if (!messageids || messageids.length === 0) {
            const noapplicationverify = new EmbedBuilder()
              .setColor("#008000")
              .setTitle(`${user.user.username} (VERIFIED)`)
              .setThumbnail(
                user.displayAvatarURL({ size: 2048, format: "png" }),
              )
              .addFields({
                name: "Member info",
                value: `[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.user.globalName ?? user.user.username}\`\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(user.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`,
              })
              .setFooter({ text: `Verified by ${interaction.user.username}` });

            await rateLimitedOperation(async () => {
              await logChannel.send({
                content: `<@${userID}>`,
                embeds: [noapplicationverify],
              });
            });
          }

          if (
            logChannel &&
            reviewChannel &&
            messageids &&
            messageids.length > 0
          ) {
            const messages = [];
            for (const messageId of messageids) {
              try {
                const message = await rateLimitedOperation(async () => {
                  return await reviewChannel.messages.fetch(messageId);
                });
                if (message) messages.push(message);
              } catch (error) {
                if (error.code === 10008) {
                  console.log(`Message ${messageId} not found - skipping`);
                  continue;
                }
                console.error(`Error fetching message ${messageId}:`, error);
                continue;
              }
            }

            // Sort by timestamp
            messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

            // Send modified embeds to logs and delete from review
            for (const message of messages) {
              try {
                if (message.flags?.has(MessageFlags.IsComponentsV2)) {
                  const verifiedContainer = await handleV2edit(
                    interaction,
                    message,
                  );

                  let threadEmbed;

                  if (message.thread) {
                    threadEmbed = new EmbedBuilder()
                      .setTitle(`Thread Summary`)
                      .setColor("#008000");

                    try {
                      const threadMessages = await rateLimitedOperation(
                        async () => {
                          return await message.thread.messages.fetch();
                        },
                      );

                      if (threadMessages.size > 1) {
                        const messagesArray = Array.from(
                          threadMessages.values(),
                        )
                          .sort(
                            (a, b) => a.createdTimestamp - b.createdTimestamp,
                          )
                          .slice(1);

                        const formattedMessages = messagesArray?.map((msg) => {
                          let content;

                          if (msg.flags?.has(MessageFlags.IsComponentsV2)) {
                            content =
                              msg.components?.[0]?.components?.[0]?.content ||
                              "No content";
                          } else {
                            content = msg.content || "No content";
                          }

                          if (msg.author.id === client.user.id) {
                            content = content.replace(
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
                      threadEmbed.setDescription(
                        "Error loading thread messages",
                      );
                    }
                  }

                  const sendmessage = await rateLimitedOperation(async () => {
                    return await logChannel.send({
                      flags: [MessageFlags.IsComponentsV2],
                      components: [verifiedContainer],
                    });
                  });

                  const threadchannel = await rateLimitedOperation(async () => {
                    return await sendmessage.startThread({
                      name: `${user.user.username}'s log`,
                    });
                  });

                  if (threadEmbed) {
                    await rateLimitedOperation(async () => {
                      await threadchannel.send({ embeds: [threadEmbed] });
                    });
                  }

                  await rateLimitedOperation(async () => {
                    await threadchannel.setArchived(true);
                  });

                  if (message.thread) {
                    await rateLimitedOperation(async () => {
                      await message.thread.delete();
                    }).catch(console.error);
                  }

                  await rateLimitedOperation(async () => {
                    await message.delete();
                  }).catch(console.error);
                } else if (message.embeds && message.embeds[0]) {
                  const originalembed = message.embeds[0];

                  const Embed = new EmbedBuilder(originalembed)
                    .setColor("#008000")
                    .setTitle(
                      (originalembed.title || "Verification") + " (VERIFIED)",
                    )
                    .setFooter({
                      text: `Verified by ${interaction.user.username} | ${originalembed?.footer?.text || userID}`,
                    });

                  await rateLimitedOperation(async () => {
                    await logChannel.send({
                      content: `<@${userID}>`,
                      embeds: [Embed],
                    });
                  });

                  await rateLimitedOperation(async () => {
                    await message.delete();
                  }).catch(console.error);
                }
              } catch (error) {
                console.error(`Error processing log message:`, error);
              }
            }
          }
        } else {
          // if log channel does not exist or is the same as review channel
          if (messageids && messageids.length > 0) {
            for (const messageId of messageids) {
              try {
                const message = await rateLimitedOperation(async () => {
                  return await interaction.channel.messages.fetch(messageId);
                });

                if (message && message.author.id === client.user.id) {
                  if (message.flags?.has(MessageFlags.IsComponentsV2)) {
                    const verifiedContainer = await handleV2edit(
                      interaction,
                      message,
                    );
                    await rateLimitedOperation(async () => {
                      await message.edit({
                        flags: [MessageFlags.IsComponentsV2],
                        components: [verifiedContainer],
                      });
                    });
                  } else if (
                    message.embeds &&
                    message.embeds[0] &&
                    !message?.embeds[0]?.footer?.text?.includes("Verified")
                  ) {
                    const originalembed = message.embeds[0];

                    const Embed = new EmbedBuilder(originalembed)
                      .setColor("#008000")
                      .setTitle(
                        (originalembed.title || "Verification") + " (VERIFIED)",
                      )
                      .setFooter({
                        text: `Verified by ${interaction.user.username} | ${originalembed?.footer?.text || userID}`,
                      });

                    await rateLimitedOperation(async () => {
                      await message.edit({ embeds: [Embed], components: [] });
                    });
                  }
                }
              } catch (error) {
                if (error.code === 10008) {
                  console.log(`Message ${messageId} not found - skipping`);
                  continue;
                }
                console.error(
                  `Failed to process message with ID ${messageId}: ${error}`,
                );
              }
            }
          } else {
            const noapplicationverify = new EmbedBuilder()
              .setColor("#008000")
              .setTitle(`${user.user.username} (VERIFIED)`)
              .setThumbnail(
                user.displayAvatarURL({ size: 2048, format: "png" }),
              )
              .addFields({
                name: "Member info",
                value: `[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.user.globalName ?? user.user.username}\`\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(user.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`,
              })
              .setFooter({ text: `Verified by ${interaction.user.username}` });

            await rateLimitedOperation(async () => {
              await interaction.channel.send({ embeds: [noapplicationverify] });
            });
          }
        }

        // Delete verification data
        if (messageids && messageids.length > 0) {
          delete verification.guildVerifications[interaction.guild.id];
          verification.changed("guildVerifications", true);
          await verification.save();
        }

        // Send welcome message
        if (welcomeChannel && welcomeMessage) {
          const channel = interaction.guild.channels.cache.get(welcomeChannel);

          if (channel) {
            const getMentions = (content) => {
              if (!content) return "";
              const userMentions = content.match(/<@!?(\d+)>/g) || [];
              const roleMentions = content.match(/<@&(\d+)>/g) || [];
              const uniqueUserMentions = new Set(userMentions);
              const uniqueRoleMentions = new Set(roleMentions);
              return `${Array.from(uniqueUserMentions).join(" ")} ${Array.from(uniqueRoleMentions).join(" ")}`;
            };

            if (welcomeMessage.text) {
              const finalText = await processText(
                welcomeMessage.text,
                user,
                interaction,
                null,
                verifiedRoles,
              );

              await channel.send({
                content: finalText,
              });
            } else {
              const finalTitle = welcomeMessage.title
                ? await processText(
                    welcomeMessage.title,
                    user,
                    interaction,
                    null,
                    verifiedRoles,
                  )
                : null;
              const finalDescription = welcomeMessage.description
                ? await processText(
                    welcomeMessage.description,
                    user,
                    interaction,
                    null,
                    verifiedRoles,
                  )
                : null;
              const messageContent = getMentions(finalDescription);

              const welcomeEmbed = new EmbedBuilder()
                .setTitle(finalTitle ?? null)
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
                  iconURL: user.user.displayAvatarURL({
                    dynamic: true,
                    size: 128,
                  }),
                });
              } else {
                welcomeEmbed.setThumbnail(
                  user.user.displayAvatarURL({ dynamic: true, size: 512 }),
                );
              }

              await channel.send({
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
        }

        // Send verification message to user
        if (serverConfig.verifymessage) {
          const title = serverConfig.verifymessage.title;
          const description = serverConfig.verifymessage.description;
          const color = serverConfig.verifymessage.color;
          const image = serverConfig.verifymessage.image;

          const finalTitle = await processText(
            title,
            user,
            interaction,
            null,
            verifiedRoles,
          );
          const finalDescription = await processText(
            description,
            user,
            interaction,
            null,
            verifiedRoles,
          );

          const finalEmbed = new EmbedBuilder()
            .setTitle(finalTitle ?? null)
            .setDescription(finalDescription)
            .setColor(color)
            .setImage(
              image
                ? `attachment://verifymessage.${image.split(".").pop()}`
                : null,
            );

          await user
            .send({
              embeds: [finalEmbed],
              files: image
                ? [
                    new AttachmentBuilder(image).setName(
                      `verifymessage.${image.split(".").pop()}`,
                    ),
                  ]
                : [],
            })
            .catch(() => {});
        }
      } catch (error) {
        console.error("could not verify user: " + error);
        results.notFound.push(userID);
        continue;
      }
    }

    let replyMessage = "";
    if (results.success.length > 0) {
      replyMessage += `**Successfully verified:** ${results.success?.map((id) => `<@${id}>`).join(", ")}`;
    }
    if (results.notFound.length > 0) {
      replyMessage += `\n**Users not found:** ${results.notFound?.map((id) => `<@${id}>`).join(", ")}`;
    }

    await interaction.editReply(replyMessage);
  },
};

// V2 Component handler function
async function handleV2edit(interaction, message) {
  const verifiedContainer = new ContainerBuilder({
    accent_color: 0x008000,
  });

  const originalContainer = message.components[0];

  if (originalContainer?.components) {
    for (const component of originalContainer.components) {
      if (component.type === 9) {
        // Section component
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
      } else if (component.type === 10) {
        // Text display component
        verifiedContainer.addTextDisplayComponents(
          new TextDisplayBuilder({
            content: component.content,
          }),
        );
      } else if (component.type === 14) {
        // Separator component
        verifiedContainer.addSeparatorComponents(
          new SeparatorBuilder({
            spacing: component.spacing || SeparatorSpacingSize.Small,
          }),
        );
      } else if (component.type === 12) {
        // Media gallery component
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

async function processText(
  text,
  user,
  interaction,
  originalembed,
  verifiedRoles,
) {
  if (!text) return "";

  if (text.toLowerCase().includes("{q") && originalembed) {
    const regex = /\{q[0-9]\}/gi;
    const matches = text.match(regex);

    if (matches) {
      matches.forEach((match) => {
        const questionNumber = match.slice(2, -1);
        const field = originalembed.fields.find((field) =>
          field.value.startsWith(`**${questionNumber}.**`),
        );

        if (field) {
          const answer =
            field.value.split("_ _")[1]?.trim() || "No answer provided";
          text = text?.replace(new RegExp(match, "gi"), answer);
        }
      });
    }
  } else if (originalembed === null) {
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

  return text;
}

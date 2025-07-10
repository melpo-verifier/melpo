const {
  SlashCommandBuilder,
  EmbedBuilder,
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
    .setName("deny")
    .setDescription("denies (multiple) people")
    .setContexts(0)
    .addStringOption((option) =>
      option
        .setName("users")
        .setDescription("The users to deny (mention them or provide their IDs)")
        .setRequired(true),
    ),
  async execute({ interaction, client }) {
    const serverConfig = await ServerConfig.findOne({
      where: { server_id: interaction.guild.id },
    });

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

    const users = [];
    for (const id of allUserIds) {
      try {
        const user = await interaction.guild.members.fetch(id);
        if (user) users.push(user);
      } catch {
        // User not found, will be handled in results
      }
    }

    if (users.length === 0) {
      return interaction.reply({
        content: "No valid users found in the guild.",
        flags: MessageFlags.Ephemeral,
      });
    }

    //check if there is a bot among the mentioned users
    if (users.some((user) => user.user.bot)) {
      return interaction.reply({
        content: "You cannot deny a bot.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply(`Denying ${users.length} user(s)...`);

    const results = {
      success: [],
      notFound: [],
    };

    for (const userID of allUserIds) {
      try {
        const user = await interaction.guild.members.fetch(userID);

        if (!user) {
          throw new Error("User not found");
        }

        const verification = await Verification.findOne({
          where: { userId: userID },
        });
        const messageids =
          verification?.guildVerifications?.[interaction.guild.id] || [];
        const invitetracker = await InviteTracker.findOne({
          where: { unique_id: `${userID}_${interaction.guild.id}` },
        });

        // Handle separate log channel case
        if (
          serverConfig.verifylogs &&
          serverConfig.reviewchannel !== serverConfig.verifylogs
        ) {
          const reviewChannel = interaction.guild.channels.cache.get(
            serverConfig.reviewchannel,
          );
          const logChannel = interaction.guild.channels.cache.get(
            serverConfig.verifylogs,
          );

          if (!messageids || messageids.length === 0) {
            const noapplicationdeny = new EmbedBuilder()
              .setColor("#EB2121")
              .setTitle(`${user.user.username} (DENIED)`)
              .setThumbnail(
                user.displayAvatarURL({ size: 2048, format: "png" }),
              )
              .addFields({
                name: "Member info",
                value: `[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.user.globalName ?? user.user.username}\`\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(user.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`,
              })
              .setFooter({ text: `Denied by ${interaction.user.username}` });

            await rateLimitedOperation(async () => {
              await logChannel.send({
                content: `<@${userID}>`,
                embeds: [noapplicationdeny],
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
                  const deniedContainer = await handleV2edit(
                    interaction,
                    message,
                  );

                  let threadEmbed;

                  if (message.thread) {
                    threadEmbed = new EmbedBuilder()
                      .setTitle(`Thread Summary`)
                      .setColor("#EB2121");

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
                      components: [deniedContainer],
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
                    .setColor("#EB2121")
                    .setTitle(
                      (originalembed.title || "Verification") + " (DENIED)",
                    )
                    .setFooter({
                      text: `Denied by ${interaction.user.username} | ${originalembed?.footer?.text || userID}`,
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
          if (messageids && messageids.length > 0) {
            for (const messageId of messageids) {
              try {
                const message = await rateLimitedOperation(async () => {
                  return await interaction.channel.messages.fetch(messageId);
                });

                if (
                  message &&
                  message.author.id === client.user.id &&
                  !message.embeds[0]?.footer?.text?.includes("Denied")
                ) {
                  if (message.flags?.has(MessageFlags.IsComponentsV2)) {
                    const deniedContainer = await handleV2edit(
                      interaction,
                      message,
                    );
                    await rateLimitedOperation(async () => {
                      await message.edit({
                        flags: [MessageFlags.IsComponentsV2],
                        components: [deniedContainer],
                      });
                    });
                  } else if (message.embeds && message.embeds[0]) {
                    const originalembed = message.embeds[0];

                    const Embed = new EmbedBuilder(originalembed)
                      .setColor("#EB2121")
                      .setTitle(
                        (originalembed.title || "Verification") + " (DENIED)",
                      )
                      .setFooter({
                        text: `Denied by ${interaction.user.username} | ${originalembed?.footer?.text || userID}`,
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
              .setColor("#EB2121")
              .setTitle(`${user.user.username} (DENIED)`)
              .setThumbnail(
                user.displayAvatarURL({ size: 2048, format: "png" }),
              )
              .addFields({
                name: "Member info",
                value: `[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.user.globalName ?? user.user.username}\`\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(user.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`,
              })
              .setFooter({ text: `Denied by ${interaction.user.username}` });

            await rateLimitedOperation(async () => {
              await interaction.channel.send({ embeds: [noapplicationverify] });
            });
          }
        }

        if (messageids && messageids.length > 0) {
          delete verification.guildVerifications[interaction.guild.id];
          verification.changed("guildVerifications", true);
          await verification.save();
        }

        const denyEmbed = new EmbedBuilder()
          .setColor("#EB2121")
          .setTitle("Application Denied")
          .setDescription(
            `Your application into **${interaction.guild.name}** has been denied!\n**Reason:** none given`,
          );

        await user.send({ embeds: [denyEmbed] }).catch(() => {});

        results.success.push(userID);
      } catch (error) {
        console.error(`Error processing user ${userID}: ${error.message}`);
        results.notFound.push(userID);
        continue;
      }
    }

    let replyMessage = "";
    if (results.success.length > 0) {
      replyMessage += `**Successfully denied:** ${results.success?.map((id) => `<@${id}>`).join(", ")}`;
    }
    if (results.notFound.length > 0) {
      replyMessage += `\n**Users not found:** ${results.notFound?.map((id) => `<@${id}>`).join(", ")}`;
    }

    await interaction.editReply(replyMessage);
  },
};

async function handleV2edit(interaction, message) {
  const deniedContainer = new ContainerBuilder({
    accent_color: 0xeb2121,
  });

  const originalContainer = message.components[0];

  if (originalContainer?.components) {
    for (const component of originalContainer.components) {
      if (component.type === 9) {
        // Section component
        let content = component.components[0].content;

        content = content.replace(/<@&\d+>/g, "").trim();

        deniedContainer.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder({
                content:
                  content +
                  `\n**Status:** \`Denied by ${interaction.user.username}\``,
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
        deniedContainer.addTextDisplayComponents(
          new TextDisplayBuilder({
            content: component.content,
          }),
        );
      } else if (component.type === 14) {
        // Separator component
        deniedContainer.addSeparatorComponents(
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
          deniedContainer.addMediaGalleryComponents(
            new MediaGalleryBuilder({
              items: mappedurls,
            }),
          );
        }
      }
    }
  }

  deniedContainer.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: `-# Denied by ${interaction.user.username} (${interaction.user.id})`,
    }),
  );

  return deniedContainer;
}

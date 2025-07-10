const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
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
const { Verification, ServerConfig } = require("../dbObjects.js");

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
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasManagerRole = serverConfig.managerrole.some((role) =>
      member.roles.cache.has(role),
    );

    if (!hasManagerRole) {
      return interaction.followUp({
        content: `You do not have permission to manage verifications. You need one of the following roles: ${serverConfig.managerrole?.map((role) => `<@&${role}>`).join(", ")}`,
        flags: MessageFlags.Ephemeral,
      });
    }
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
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    if (error.code === 10007) {
      // Unknown Member
      return interaction.followUp({
        content: "This user is no longer in the server.",
        flags: MessageFlags.Ephemeral,
      });
    }
    throw error;
  }

  const botMember = interaction.guild.members.cache.get(client.user.id);

  if (!member) {
    return interaction.followUp({
      content: `Could not find member with ID ${userid}, probably because they have left the server.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if bot has kick permission
  if (!botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    return interaction.followUp({
      content: "I don't have permission to kick members",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if target is owner
  if (member.id === interaction.guild.ownerId) {
    return interaction.followUp({
      content: "I cannot kick the server owner",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check role hierarchy
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    return interaction.followUp({
      content:
        "I cannot kick this user - they have a role higher than or equal to mine, please make sure my highest role is higher than the user's highest role",
      flags: MessageFlags.Ephemeral,
    });
  }

  await user.send({ embeds: [kickEmbed] }).catch(() => {});
  await member.kick(`Kicked by ${interaction.user.username}`);

  const verification = await Verification.findOne({
    where: { userId: userid },
  });
  const messageids = verification?.guildVerifications?.[interaction.guild.id];

  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    const originalContainer = interaction.message.components[0];
    interaction.editReply({ components: [originalContainer, disverify] });
  } else {
    await interaction.editReply({ components: [disverify] });
  }

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
          await new Promise((resolve) => setTimeout(resolve, 300));
          const message = await reviewChannel.messages.fetch(messageId);
          if (message) messages.push(message);
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

        if (message.flags.has(MessageFlags.IsComponentsV2)) {
          const verifiedContainer = await handleV2edit(interaction, message);

          let threadEmbed;

          if (message.thread) {
            threadEmbed = new EmbedBuilder()
              .setTitle(`Thread Summary`)
              .setColor("#EB2121");

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
                threadEmbed.setDescription("No additional messages in thread");
              }
            } catch (error) {
              console.error("Error fetching thread messages:", error);
              threadEmbed.setDescription("Error loading thread messages");
            }
          }

          let sendmessage = await logChannel.send({
            flags: [MessageFlags.IsComponentsV2],
            components: [verifiedContainer],
          });

          let threadchannel = await sendmessage.startThread({
            name: `${user.username}'s log`,
          });

          if (threadEmbed) {
            await threadchannel.send({ embeds: [threadEmbed] });
          }
          await threadchannel.setArchived(true);
          if (interaction.message.thread) {
            await interaction.message.thread.delete();
          }

          await message.delete().catch(console.error);
        } else {
          let originalembed = message.embeds[0];

          let Embed = new EmbedBuilder(originalembed)
            .setColor("#EB2121")
            .setTitle(originalembed.title + " (KICKED)")
            .setFooter({
              text: `Kicked by ${interaction.user.username} | ${originalembed?.footer?.text || userid}`,
            });

          await logChannel.send({ content: `<@${userid}>`, embeds: [Embed] });
          await message.delete().catch(console.error);
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
        .setColor("#EB2121")
        .setTitle(originalEmbed.title + " (KICKED)")
        .setFields(fields)
        .setFooter({
          text: `Kicked by ${interaction.user.username} | ${originalEmbed?.footer?.text || userid}`,
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
          // Add a 1-second delay
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (message && message.author.id === client.user.id) {
            if (message.flags.has(MessageFlags.IsComponentsV2)) {
              const editedContainer = await handleV2edit(interaction, message);
              await message.edit({
                flags: [MessageFlags.IsComponentsV2],
                components: [editedContainer],
              });
            } else if (!message?.embeds[0]?.footer?.text?.includes("Kicked")) {
              var originalembed = message.embeds[0];

              let Embed = new EmbedBuilder(originalembed)
                .setColor("#EB2121")
                .setTitle(originalembed.title + " (KICKED)")
                .setFooter({
                  text: `Kicked by ${interaction.user.username} | ${originalembed?.footer?.text || userid}`,
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

  //delete the message ids from verification table
  if (messageids && messageids.length > 0) {
    delete verification.guildVerifications[interaction.guild.id];
    verification.changed("guildVerifications", true);
    await verification.save();
  }
};

async function handleV2edit(interaction, message) {
  const editedContainer = new ContainerBuilder({
    accent_color: 0xeb2121,
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
                content:
                  content +
                  `\n**Status:** \`Kicked by ${interaction.user.username}\``,
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
            media: {
              url: item.media.url,
            },
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
      content: `-# Kicked by ${interaction.user.username} (${interaction.user.id})`,
    }),
  );

  return editedContainer;
}

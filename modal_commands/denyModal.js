const {
  ButtonBuilder,
  ActionRowBuilder,
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
const { Verification, ServerConfig } = require("../dbObjects.js");

module.exports = async ({ interaction, client, userid }) => {
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

  if (userid && userid.includes(" | ")) {
    await interaction.reply({
      content: `Oop! It seems this user has already been handled by someone else!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = await client.users.fetch(userid);

  await interaction.deferUpdate();
  //disable buttons without changing the other components
  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
    const originalContainer = interaction.message.components[0];
    interaction.editReply({ components: [originalContainer, disverify] });
  } else {
    await interaction.editReply({ components: [disverify] });
  }

  const verification = await Verification.findOne({
    where: { userId: userid },
  });
  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });
  const messageids = verification?.guildVerifications?.[interaction.guild.id];
  const reason = interaction.fields.getTextInputValue("denyInput");

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

      for (const message of messages) {
        await new Promise((resolve) => setTimeout(resolve, 600));

        if (message.flags.has(MessageFlags.IsComponentsV2)) {
          const verifiedContainer = await handleV2edit(
            interaction,
            message,
            reason,
          );

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
            .setTitle(originalembed.title + " (DENIED)")
            .setFooter({
              text: `Denied by ${interaction.user.username} | ${originalembed?.footer?.text || userid}`,
            })
            .setDescription(`**Denied for reason:** ${reason}`);

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
        reason,
      );
      console.log(verifiedContainer);

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
        .setTitle(originalEmbed.title + " (DENIED)")
        .setFields(fields)
        .setFooter({
          text: `Denied by ${interaction.user.username} | ${originalEmbed?.footer?.text || userid}`,
        })
        .setDescription(`**Denied for reason:** ${reason}`);

      await interaction.editReply({ embeds: [embed], components: [] });
    }

    if (messageids && messageids.length > 0) {
      for (const messageId of messageids) {
        if (messageId === interaction.message.id) {
          continue;
        }

        try {
          const message = await interaction.channel.messages.fetch(messageId);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (message && message.author.id === client.user.id) {
            if (message.flags.has(MessageFlags.IsComponentsV2)) {
              const editedContainer = await handleV2edit(
                interaction,
                message,
                reason,
              );
              await message.edit({
                flags: [MessageFlags.IsComponentsV2],
                components: [editedContainer],
              });
            } else if (!message?.embeds[0]?.footer?.text?.includes("Denied")) {
              var originalembed = message.embeds[0];

              let Embed = new EmbedBuilder(originalembed)
                .setColor("#EB2121")
                .setTitle(originalembed.title + " (DENIED)")
                .setFooter({
                  text: `Denied by ${interaction.user.username} | ${originalembed?.footer?.text || userid}`,
                })
                .setDescription(`**Denied for reason:** ${reason}`);

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

  //delete the message ids from verifications
  if (messageids && messageids.length > 0) {
    delete verification.guildVerifications[interaction.guild.id];
    verification.changed("guildVerifications", true);
    await verification.save();
  }

  const denyEmbed = new EmbedBuilder()
    .setColor("#EB2121")
    .setTitle("Application Denied")
    .setDescription(
      `Your application into **${interaction.guild.name}** has been denied!\n**Reason:** ${interaction.fields.getTextInputValue("denyInput")}`,
    );

  try {
    await user.send({ embeds: [denyEmbed] });
    await interaction.followUp({
      content: `✅ User denied successfully!`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    if (error.code === 50007) {
      await interaction.followUp({
        content: `✅ User denied successfully\n⚠️ Unable to send a DM as this user has their DMs disabled or has blocked the bot.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      throw error;
    }
  }
};

async function handleV2edit(interaction, message, reason) {
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
                  `\n**Status:** \`Denied by ${interaction.user.username}\`: ${reason}`,
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
        console.log(component.items);
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
      content: `-# Denied by ${interaction.user.username} (${interaction.user.id})`,
    }),
  );

  return editedContainer;
}

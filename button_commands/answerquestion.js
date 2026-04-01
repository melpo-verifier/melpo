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
} = require("discord.js");
const { QuestionId } = require("../dbObjects.js");
const { getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");
// MAYBE EASIER TO CHANGE DATABASE TO A USER RELATED DATABASE, NOT MESSAGE ID RELATED DATABASE IN CASE IF THE USER LEAVES THE SERVER (USER -> GUILD1: {...}, gUILD2: {...})

module.exports = async ({ interaction, client }) => {

  if (interaction.replied || interaction.deferred) {
    console.warn("Interaction already replied or deferred, skipping.");
    return;
  }

  const user = interaction.user;
  const info = await QuestionId.findOne({
    where: { interactionMessageId: interaction.message.id },
  });

  if (!info) {
    return interaction.reply({
      content: "This question is no longer available. It may have already been answered or expired.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const questionIdData = info.get({ plain: true });
  const guildId = info.guildId;
  const verificationMessageId = info.verificationMessageId;
  const channelId = info.channelId;
  const dmChannel = await user.createDM();
  const message = await dmChannel.messages.fetch(info.interactionMessageId);

  const applicationId = info.applicationId;

  const { application, error } = await getApplicationByIdWithFallback(applicationId, guildId);
  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const confirmrow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("answerquestion")
      .setLabel("Answer")
      .setStyle("Success"),
    // new ButtonBuilder()
    //   .setCustomId("opt-out")
    //   .setLabel("Opt-out")
    //   .setStyle("Danger"),
  );

  const disabledconfirmrow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("answerquestion")
      .setLabel("Answer")
      .setStyle("Success")
      .setDisabled(true),
    // new ButtonBuilder()
    //   .setCustomId("opt-out")
    //   .setLabel("Opt-out")
    //   .setStyle("Danger")
    //   .setDisabled(true),
  );

  const replybutton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`question_${applicationId}_${user.id}`)
      .setLabel("Reply")
      .setStyle("Primary"),
  );

  const cancelButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cancel")
      .setLabel("Cancel")
      .setStyle("Danger"),
  );
  const disabledcancelButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("cancel")
      .setLabel("Cancel")
      .setStyle("Danger")
      .setDisabled(true),
  );

  await message.edit({ components: [disabledconfirmrow] });
  await interaction.reply({
    content: `Please send your answer to the question you just pressed "answer" to`,
    components: [cancelButton],
  });
  const sendanswer = await interaction.fetchReply();

  await QuestionId.destroy({
    where: { interactionMessageId: interaction.message.id },
  });

  const collectorFilter = (m) => m.author.id === user.id;
  const messageCollector = dmChannel.createMessageCollector({
    filter: collectorFilter,
    max: 1,
  });

  const buttonFilter = (i) => i.customId === "cancel" && i.user.id === user.id;
  const buttonCollector = dmChannel.createMessageComponentCollector({
    filter: buttonFilter,
    max: 1,
  });

  buttonCollector.on("collect", async (i) => {
    message.edit({ components: [confirmrow] });
    await QuestionId.create(questionIdData);
    i.update({
      content: "cancelled your answer",
      components: [disabledcancelButton],
    }).then(() => {
      setTimeout(() => {
        i.message.delete();
      }, 5000);
    });
    messageCollector.stop("cancelled");
  });

  const verificationChannelId = application.reviewchannel;

  messageCollector.on("collect", async (m) => {
    let totalcontent = m.content;
    let answercontent = m.content;
    let attachmentUrls = [];

    // Truncate if too long
    if (answercontent.length > 1024) {
      answercontent = answercontent.substring(0, 1021) + "...";
    }

    const questionform = interaction.message.embeds[0];

    if(totalcontent.length + questionform.fields[0].value.length > 3800) {
      totalcontent = totalcontent.substring(0, 3800 - questionform.fields[0].value.length) + "...";
    }

    const rolesToPing = Array.isArray(application.questionpingrole)
      ? application.questionpingrole?.map((roleId) => `<@&${roleId}>`).join(" ")
      : application.questionpingrole
        ? `<@&${application.questionpingrole}>`
        : null;

    const container = new ContainerBuilder({
      accent_color: 4161521,
    }).addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `${rolesToPing ? `-# ${rolesToPing}` : ""}\n### Question answered by <@${user.id}>\n**Question:**\n${interaction.message.embeds[0].fields[0].value}\n**Answer:**\n${totalcontent}`,
        spacing_size: SeparatorSpacingSize.Small,
      }),
    );

    if (m.attachments.size > 0) {
      const mediaItems = [];
      for (const attachment of m.attachments.values()) {
        attachmentUrls.push(attachment.url);

        if (
          attachment.contentType &&
          attachment.contentType.startsWith("image/")
        ) {
          mediaItems.push({
            media: { url: attachment.url },
          });
        }
      }

      if (mediaItems.length > 0) {
        container.addSeparatorComponents(
          new SeparatorBuilder({
            spacing: SeparatorSpacingSize.Small,
          }),
        );

        container.addMediaGalleryComponents(
          new MediaGalleryBuilder({
            items: mediaItems,
          }),
        );
      }
    }

    const answerform = EmbedBuilder.from(questionform)
      .addFields({ name: "Answer", value: answercontent })
      .setColor("#008000");

    await interaction.message.edit({
      components: [disabledconfirmrow],
      embeds: [answerform],
    });
    await sendanswer.edit({ content: "Answer submitted!", components: [] });

    if (
      client.user.id === "849613551080701983" ||
      client.user.id === "916372883087974440"
    ) {
      return client.shard.broadcastEval(
        async (
          c,
          {
            verificationChannelId,
            verificationMessageId,
            replybutton,
            container,
            channelId,
          },
        ) => {
          // Get the thread attached to the verification message
          let threadchannelid = null;
          let verificationMessage = null;
          const verificationChannel = await c.channels.fetch(
            verificationChannelId,
          );

          if (verificationChannelId !== channelId) {
            threadchannelid = channelId;
          } else {
            try {
              if (verificationChannel) {
                verificationMessage =
                  await verificationChannel.messages.fetch(
                    verificationMessageId,
                  );
                threadchannelid = verificationMessage?.thread?.id;
              }
            } catch (error) {
              console.error(
                "Error fetching verification message or thread:",
                error,
              );
            }
          }

          if (verificationChannel) {
            const { MessageFlags } = require("discord.js");
            if (threadchannelid) {
              const threadChannel = c.channels.cache.get(threadchannelid);
              await threadChannel.send({
                flags: [MessageFlags.IsComponentsV2],
                components: [container, replybutton],
              });
            } else if (verificationMessage) {
              await verificationMessage.reply({
                flags: [MessageFlags.IsComponentsV2],
                components: [container, replybutton],
              });
            }
          }
          return false;
        },
        {
          context: {
            verificationChannelId: verificationChannelId,
            verificationMessageId: verificationMessageId,
            replybutton: replybutton,
            container: container,
            channelId: channelId,
          },
        },
      );
    } else {
      let threadchannelid = null;
      let verificationMessage = null;
      const verificationChannel = client.channels.cache.get(
        verificationChannelId,
      );

      if (verificationChannelId !== channelId) {
        threadchannelid = channelId;
      } else {
        try {
          if (verificationChannel) {
            verificationMessage =
              await verificationChannel.messages.fetch(verificationMessageId);
            threadchannelid = verificationMessage?.thread?.id;
          }
        } catch (error) {
          console.error(
            "Error fetching verification message or thread:",
            error,
          );
        }
      }

      if (threadchannelid) {
        const threadChannel = client.channels.cache.get(threadchannelid);
        await threadChannel.send({
          flags: [MessageFlags.IsComponentsV2],
          components: [container, replybutton],
        });
      } else if (verificationMessage) {
        await verificationMessage.reply({
          flags: [MessageFlags.IsComponentsV2],
          components: [container, replybutton],
        });
      }

      return false;
    }
  });
};

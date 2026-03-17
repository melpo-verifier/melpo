const {
  Verification,
  InviteTracker,
} = require("../dbObjects.js");
const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorSpacingSize,
  SeparatorBuilder,
  MediaGalleryBuilder,
  ThumbnailBuilder,
  SectionBuilder,
  AttachmentBuilder,
  FileBuilder,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { updateVerifications, getApplicationByIdWithFallback } = require("../js/tempconfigfuncs.js");
const { resolveImage } = require("../js/imageUtils.js");
const { addMessageId } = require("../js/verificationHandler.js");

const activeVerifications = new Map();

const rateLimitMap = new Map();

setInterval(() => {
  const now = Date.now();
  const expiredSessions = [];
  const expiredRateLimits = [];

  for (const [key, session] of activeVerifications.entries()) {
    if (now - session.timestamp > 360000) {
      // older than 60 minutes gets deleted
      expiredSessions.push(key);
    }
  }

  for (const [key, timestamp] of rateLimitMap.entries()) {
    if (now - timestamp > 60000) {
      expiredRateLimits.push(key);
    }
  }

  expiredSessions.forEach((key) => activeVerifications.delete(key));
  expiredRateLimits.forEach((key) => rateLimitMap.delete(key));

  if (expiredSessions.length > 0) {
    console.log(
      `Cleaned up ${expiredSessions.length} expired verification sessions`,
    );
  }
  if (expiredRateLimits.length > 0) {
    console.log(`Cleaned up ${expiredRateLimits.length} expired rate limits`);
  }
}, 600000);

module.exports = async ({ interaction, client, applicationId }) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const rateLimitKey = `${interaction.user.id}`;

  if (rateLimitMap.has(rateLimitKey)) {
    const timeSinceLastAttempt = Date.now() - rateLimitMap.get(rateLimitKey);
    const timeLeft = Math.ceil((30000 - timeSinceLastAttempt) / 1000);

    if (timeLeft > 0) {
      return await interaction.editReply({
        content: `Please wait ${timeLeft} seconds before starting another verification.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      rateLimitMap.delete(rateLimitKey);
    }
  }

  // Check if the user already has an active verification session
  if (activeVerifications.has(interaction.user.id)) {
    return await interaction.editReply({
      content: `<@${interaction.user.id}>, you already have an active verification session! Please complete or cancel it before starting a new one.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  rateLimitMap.set(rateLimitKey, Date.now());

  try {
    const user = interaction.user;
    const guildId = interaction.guild.id;

    // Find the application by ID and validate guild ownership
    const { application, error } = await getApplicationByIdWithFallback(applicationId, guildId);
    
    if (error || !application) {
      return await interaction.editReply({
        content: `This verification button is not configured correctly. Please contact the server staff. (${error || "Application not found"})`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const appName = application.name;
    const {
      verifychannel: verifyChannelId,
      reviewchannel: verifyLogsChannelId,
      questions: botQuestions,
      pingrole: pingStaffRoleId,
    } = application;

    let parsedQuestions;
    try {
      if (
        !botQuestions ||
        !Array.isArray(botQuestions) ||
        botQuestions.length === 0
      ) {
        return await interaction.editReply({
          content: `No verification questions are configured. Please contact the server staff.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      parsedQuestions = botQuestions.map((question, index) => {
        let parsed;
        if (typeof question === "string") {
          try {
          try {
            parsed = JSON.parse(question);
          } catch (parseError) {
            console.error(`Failed to parse question: ${parseError.message}`);
            parsed = question;
          }
          } catch (error) {
            throw new Error(`Invalid question ${index + 1}: ${error.message}`);
          }
        } else if (typeof question === "object" && question !== null) {
          parsed = question;
        } else {
          throw new Error(`Invalid question ${index + 1}: Not a string or object`);
        }
        if (!parsed.content || parsed.content.trim().length === 0) {
          throw new Error(`Question ${index + 1} has empty content`);
        }
        return parsed;
      });
    } catch (error) {
      console.error(`Question parsing error for guild ${guildId}:`, error);
      return await interaction.editReply({
        content: `Question configuration error: ${error.message}. Please contact the server staff.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const isSetupComplete =
      verifyChannelId && verifyLogsChannelId && parsedQuestions.length > 0;

    if (!isSetupComplete) {
      return await interaction.editReply({
        content: `<@${user.id}>, I am not completely set up yet! If you are a moderator, please complete the setup process first.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const verifyLogsChannel =
      interaction.guild.channels.cache.get(verifyLogsChannelId);

    if (!verifyLogsChannel) {
      return await interaction.editReply({
        content: `<@${user.id}>, the verification logs channel could not be found! Please contact server staff.`,
      });
    }

    const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
    const botPermissions = verifyLogsChannel.permissionsFor(botMember);
    if (
      !botPermissions ||
      !botPermissions.has([
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ViewChannel,
      ])
    ) {
      return await interaction.editReply({
        content: `<@${user.id}>, I don't have permissions to send messages in the verification review channel!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      activeVerifications.has(user.id) &&
      activeVerifications.get(user.id).startTime + 3600000 < Date.now()
    ) {
      console.error(
        "User has an active verification session but it has been more than an hour. Clearing the session. THIS SHOULDNT HAPPEN",
      );
      activeVerifications.delete(user.id);
    }

    // Generate a unique identifier for this verification session
    const sessionId = uuidv4();

    const numberToEmoji = [
      "1️⃣",
      "2️⃣",
      "3️⃣",
      "4️⃣",
      "5️⃣",
      "6️⃣",
      "7️⃣",
      "8️⃣",
      "9️⃣",
      "🔟",
    ];

    try {
      const dmChannel = await user.createDM();
      const cancelbutton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cancelverification-${sessionId}`)
          .setLabel("Cancel")
          .setStyle("Danger"),
      );

      const startEmbedTitle = replaceplaceholder(
        application.startmessage?.title,
        interaction.user.globalName ?? interaction.user.username,
        interaction.guild.name,
      );
      const startEmbedDescription = replaceplaceholder(
        application.startmessage?.description,
        interaction.user.globalName ?? interaction.user.username,
        interaction.guild.name,
      );
      const startEmbedimage = application.startmessage?.image;
      const startImageAsset = resolveImage(startEmbedimage);

      const startDMEmbed = new EmbedBuilder()
        .setTitle(
          startEmbedTitle && startEmbedTitle.trim() ? startEmbedTitle : null,
        )
        .setDescription(startEmbedDescription ?? null)
        .setColor(application.startmessage?.color || "#3f7ff1")
        .setFooter({
          text: `Application: ${appName} | Click "cancel" to cancel the verification.`
        })
        .setImage(startImageAsset.embedUrl);

      let firstQuestionEmbed = new EmbedBuilder()
        .setColor("#3f7ff1")
        .setFooter({
          text: `Application: ${appName} | Click "cancel" to cancel the verification.`
        });

      try {
        await dmChannel.send({
          embeds: [startDMEmbed],
        });
      } catch (error) {
        if (error.code === 50007 || error.code === 50278) {
          // Cannot send messages to this user
          await interaction.editReply({
            content: `<@${user.id}>, I cannot send you DMs! Please enable DMs from server members and try again.`,
            flags: MessageFlags.Ephemeral,
          });
          return; // DMs are closed or the user has blocked the bot
        } else {
          throw error;
        }
      }

      let startverification;

      if (parsedQuestions[0].mcq.length > 0) {
        const maxOptions = Math.min(parsedQuestions[0].mcq.length, 10);
        const mcqWithEmojis = parsedQuestions[0].mcq
          .slice(0, maxOptions)
          .map((option, index) => `${numberToEmoji[index]} ${option}`)
          .join("\n ");

        firstQuestionEmbed.addFields({
          name: ` Question \`1/${parsedQuestions.length}\``,
          value: `${parsedQuestions[0].content}\n${mcqWithEmojis}`,
        });

        const actionRows = [];
        let currentRow = new ActionRowBuilder();

        for (let i = 1; i <= maxOptions; i++) {
          if (currentRow.components.length >= 5) {
            actionRows.push(currentRow);
            currentRow = new ActionRowBuilder();
          }

          currentRow.addComponents(
            new ButtonBuilder()
              .setCustomId(i.toString())
              .setLabel(i.toString())
              .setStyle("Primary"),
          );
        }

        if (currentRow.components.length > 0) {
          actionRows.push(currentRow);
        }

        // Check component limit before sending
        const totalComponents = actionRows.reduce(
          (total, row) => total + row.components.length,
          0,
        );
        if (totalComponents > 20) {
          console.error(
            `Too many components (${totalComponents}) for first question, converting to text`,
          );
          firstQuestionEmbed = new EmbedBuilder()
            .setColor("#3f7ff1")
            .setFooter({ text: 'Click "cancel" to cancel the verification.' })
            .addFields({
              name: `Question \`1/${parsedQuestions.length}\` (Text Response)`,
              value: `${parsedQuestions[0].content}\n\nPlease type your answer (too many options for buttons).`,
            });
          startverification = await dmChannel.send({
            embeds: [firstQuestionEmbed],
            components: [cancelbutton],
          });
        } else {
          startverification = await dmChannel.send({
            embeds: [firstQuestionEmbed],
            components: [...actionRows, cancelbutton],
          });
        }

        // set verification session as active
        activeVerifications.set(user.id, {
          sessionId: sessionId,
          startTime: Date.now(),
        });
      } else {
        firstQuestionEmbed.addFields({
          name: `Question \`1/${parsedQuestions.length}\``,
          value: parsedQuestions[0].content,
        });

        startverification = await dmChannel.send({
          embeds: [firstQuestionEmbed],
          components: [cancelbutton],
        });

        // set verification session as active
        activeVerifications.set(user.id, {
          sessionId: sessionId,
          startTime: Date.now(),
        });
      }

      const startedEmbed = new EmbedBuilder()
        .setTitle("Verification Started")
        .setDescription(
          `Verification started, check your DMs or [click here](https://discord.com/channels/@me/${dmChannel.id}/${startverification.id})!`,
        )
        .setColor("#3f7ff1");

      await interaction.editReply({
        embeds: [startedEmbed],
        flags: MessageFlags.Ephemeral,
      });

      if (
        client.user.id === "849613551080701983" ||
        client.user.id === "916372883087974440"
      ) {
        await client.shard
          .broadcastEval(Verificationfunc, {
            context: {
              userid: user.id,
              botQuestions: parsedQuestions,
              startverificationid: startverification.id,
              interactionguild: interaction.guild,
              cancelbutton: cancelbutton,
              sessionId: sessionId,
            },
            shard: 0,
          })
          .then(async ([reason, responses]) => {
            activeVerifications.delete(user.id);
            await processVerificationResult(
              user,
              reason,
              responses,
              interaction,
              parsedQuestions,
              dmChannel,
              pingStaffRoleId,
              guildId,
              verifyLogsChannel,
              application.finishmessage,
              client,
              application.usethreads,
              appName,
              applicationId,
            );
          })
          .catch(async (error) => {
            activeVerifications.delete(user.id);
            if (
              !error.toString().includes("Verification was canceled") &&
              !error.toString().includes("Verification timed out")
            ) {
              throw error;
            }
          });
      } else {
        try {
          const [reason, responses] = await Verificationfunc(client, {
            userid: user.id,
            botQuestions: parsedQuestions,
            startverificationid: startverification.id,
            interactionguild: interaction.guild,
            cancelbutton: cancelbutton,
            sessionId: sessionId,
          });

          activeVerifications.delete(user.id);
          await processVerificationResult(
            user,
            reason,
            responses,
            interaction,
            parsedQuestions,
            dmChannel,
            pingStaffRoleId,
            guildId,
            verifyLogsChannel,
            application.finishmessage,
            client,
            application.usethreads,
            appName,
            applicationId,
          );
        } catch (error) {
          if (
            error.toString().includes("!Verification was canceled") &&
            !error.toString().includes("Verification timed out")
          ) {
            throw error;
          }
          activeVerifications.delete(user.id);
        }
      }

      async function Verificationfunc(
        c,
        { userid, botQuestions, startverificationid, cancelbutton, sessionId },
      ) {
        return new Promise((resolve, reject) => {
          const {
            ButtonBuilder,
            ActionRowBuilder,
            EmbedBuilder,
          } = require("discord.js");
          const numberToEmoji = [
            "1️⃣",
            "2️⃣",
            "3️⃣",
            "4️⃣",
            "5️⃣",
            "6️⃣",
            "7️⃣",
            "8️⃣",
            "9️⃣",
            "🔟",
          ];

          (async () => {
            try {
              const user = await c.users.fetch(userid);
              const dmChannel = await user.createDM();
              let startverification =
                await dmChannel.messages.fetch(startverificationid);

              const collector = dmChannel.createMessageCollector({
                filter: (m) => !m.author.bot,
                time: 3600000,
              });
              const cancelcollector = dmChannel.createMessageComponentCollector(
                { filter: (i) => i.user.id === user.id, time: 3600000 },
              );

              const responses = [];
              let isProcessing = false;

              cancelcollector.on("collect", async (i) => {
                try {
                  await i.deferUpdate();

                  if (isProcessing) {
                    return; // Ignore if already processing
                  }

                  isProcessing = true;

                  if (i.customId === `cancelverification-${sessionId}`) {
                    collector.stop("canceled");
                    cancelcollector.stop("canceled");
                    const cancelEmbed = new EmbedBuilder()
                      .setTitle("Verification Canceled")
                      .setDescription(
                        `The verification has been canceled. Feel free to restart the verification just like you did before!`,
                      )
                      .setColor("#ff0000");

                    await startverification.edit({
                      embeds: [cancelEmbed],
                      components: [],
                    });
                    reject(new Error("Verification was canceled"));
                    return;
                  }

                  if (!i.customId.includes("cancel")) {
                    const currentQuestionIndex = responses.length;

                    if (currentQuestionIndex >= botQuestions.length) {
                      isProcessing = false;
                      return;
                    }

                    const currentQuestion = botQuestions[currentQuestionIndex];

                    if (
                      !currentQuestion ||
                      !currentQuestion.mcq ||
                      currentQuestion.mcq.length === 0
                    ) {
                      console.error(
                        `Invalid MCQ question at index ${currentQuestionIndex}`,
                      );
                      isProcessing = false;
                      return;
                    }

                    const answerIndex = parseInt(i.customId) - 1;
                    if (
                      answerIndex < 0 ||
                      answerIndex >= currentQuestion.mcq.length
                    ) {
                      console.error(
                        `Invalid answer index ${answerIndex} for question ${currentQuestionIndex}`,
                      );
                      isProcessing = false;
                      return;
                    }

                    const mcqanswer = currentQuestion.mcq[answerIndex];
                    const answerEmbed = new EmbedBuilder(
                      startverification.embeds[0],
                    )
                      .setColor("#008000")
                      .addFields({
                        name: `Answer`,
                        value: `${numberToEmoji[answerIndex]} ${mcqanswer}`,
                      });

                    await startverification.edit({
                      embeds: [answerEmbed],
                      components: [],
                    });

                    const responseAnswer = {
                      content: `${numberToEmoji[answerIndex]} ${mcqanswer}`,
                    };
                    responses.push(responseAnswer);

                    if (responses.length < botQuestions.length) {
                      const nextQuestionIndex = responses.length;
                      const nextQuestion = botQuestions[nextQuestionIndex];

                      if (nextQuestion.mcq && nextQuestion.mcq.length > 0) {
                        const maxOptions = Math.min(
                          nextQuestion.mcq.length,
                          10,
                        );
                        const mcqWithEmojis = nextQuestion.mcq
                          .slice(0, maxOptions)
                          .map(
                            (option, index) =>
                              `${numberToEmoji[index]} ${option}`,
                          )
                          .join("\n ");

                        const DMEmbed = new EmbedBuilder()
                          .addFields({
                            name: `Question \`${nextQuestionIndex + 1}/${botQuestions.length}\``,
                            value: `${nextQuestion.content}\n\n${mcqWithEmojis}`,
                          })
                          .setColor("#3f7ff1")
                          .setFooter({
                            text: 'Click "cancel" to cancel the verification.',
                          });

                        const actionRows = [];
                        let currentRow = new ActionRowBuilder();

                        for (let i = 1; i <= maxOptions; i++) {
                          if (currentRow.components.length >= 5) {
                            actionRows.push(currentRow);
                            currentRow = new ActionRowBuilder();
                          }

                          currentRow.addComponents(
                            new ButtonBuilder()
                              .setCustomId(i.toString())
                              .setLabel(i.toString())
                              .setStyle("Primary"),
                          );
                        }

                        if (currentRow.components.length > 0) {
                          actionRows.push(currentRow);
                        }

                        // Check component limit (max 20 components total)
                        const totalComponents = actionRows.reduce(
                          (total, row) => total + row.components.length,
                          0,
                        );
                        if (totalComponents > 20) {
                          console.error(
                            `Too many components (${totalComponents}) for question ${nextQuestionIndex + 1}, converting to text`,
                          );
                          // Fallback to text question
                          const textEmbed = new EmbedBuilder()
                            .addFields({
                              name: `Question \`${nextQuestionIndex + 1}/${botQuestions.length}\` (Text Response)`,
                              value: `${nextQuestion.content}\n\nPlease type your answer (too many options for buttons).`,
                            })
                            .setColor("#3f7ff1")
                            .setFooter({
                              text: 'Click "cancel" to cancel the verification.',
                            });
                          startverification = await dmChannel.send({
                            embeds: [textEmbed],
                            components: [cancelbutton],
                          });
                        } else {
                          startverification = await dmChannel.send({
                            embeds: [DMEmbed],
                            components: [...actionRows, cancelbutton],
                          });
                        }
                      } else {
                        const DMEmbed = new EmbedBuilder()
                          .addFields({
                            name: `Question \`${nextQuestionIndex + 1}/${botQuestions.length}\``,
                            value: nextQuestion.content,
                          })
                          .setColor("#3f7ff1")
                          .setFooter({
                            text: 'Click "cancel" to cancel the verification.',
                          });
                        startverification = await dmChannel.send({
                          embeds: [DMEmbed],
                          components: [cancelbutton],
                        });
                      }
                    } else {
                      cancelcollector.stop("completed");
                      collector.stop("completed");
                    }
                  }
                } catch (error) {
                  console.error(
                    `Error in MCQ handler for user ${userid}:`,
                    error,
                  );
                  try {
                    await dmChannel.send(
                      "An error occurred. Please try again or contact support.",
                    );
                  } catch (dmError) {
                    console.error("Failed to send error message:", dmError);
                  }
                } finally {
                  isProcessing = false;
                }
              });
              collector.on("collect", async (collected) => {
                try {
                  if (isProcessing) {
                    return;
                  }

                  isProcessing = true;

                  const currentQuestionIndex = responses.length;

                  if (currentQuestionIndex >= botQuestions.length) {
                    isProcessing = false;
                    return;
                  }

                  const currentQuestion = botQuestions[currentQuestionIndex];

                  if (currentQuestion.mcq && currentQuestion.mcq.length > 0) {
                    isProcessing = false;
                    return;
                  }

                  let totalcontent = collected.content;
                  let answercontent = collected.content;

                  if (
                    totalcontent.length < 1 &&
                    collected.attachments.size === 0
                  ) {
                    totalcontent = "No answer provided";
                    answercontent = "No answer provided";
                  }

                  const questionLength = currentQuestion.content.length;

                  // Truncate if too long
                  if (answercontent.length > 1024 - questionLength) {
                    answercontent =
                      answercontent.substring(0, 1020 - questionLength) + "...";
                    console.log('Truncated verification answer')
                    await collected.author.send(
                      "Note: Your answer was shortened to fit Discord's limits.",
                    );
                  }

                  const answerEmbed = new EmbedBuilder(
                    startverification.embeds[0],
                  )
                    .setColor("#008000")
                    .addFields({ name: `Answer`, value: answercontent });

                  await startverification.edit({
                    embeds: [answerEmbed],
                    components: [],
                  });

                  totalcontent = {
                    content: totalcontent,
                    attachments: collected.attachments?.map(
                      (attachment) => attachment.url,
                    ),
                  };

                  responses.push(totalcontent);

                  if (responses.length < botQuestions.length) {
                    const nextQuestionIndex = responses.length;
                    const nextQuestion = botQuestions[nextQuestionIndex];

                    if (nextQuestion.mcq && nextQuestion.mcq.length > 0) {
                      const maxOptions = Math.min(nextQuestion.mcq.length, 10);
                      const mcqWithEmojis = nextQuestion.mcq
                        .slice(0, maxOptions)
                        .map(
                          (option, index) =>
                            `${numberToEmoji[index]} ${option}`,
                        )
                        .join("\n ");

                      const DMEmbed = new EmbedBuilder()
                        .addFields({
                          name: `Question \`${nextQuestionIndex + 1}/${botQuestions.length}\``,
                          value: `${nextQuestion.content}\n\n${mcqWithEmojis}`,
                        })
                        .setColor("#3f7ff1")
                        .setFooter({
                          text: 'Click "cancel" to cancel the verification.',
                        });

                      const actionRows = [];
                      let currentRow = new ActionRowBuilder();

                      for (let i = 1; i <= maxOptions; i++) {
                        if (currentRow.components.length >= 5) {
                          actionRows.push(currentRow);
                          currentRow = new ActionRowBuilder();
                        }

                        currentRow.addComponents(
                          new ButtonBuilder()
                            .setCustomId(i.toString())
                            .setLabel(i.toString())
                            .setStyle("Primary"),
                        );
                      }

                      if (currentRow.components.length > 0) {
                        actionRows.push(currentRow);
                      }

                      startverification = await dmChannel.send({
                        embeds: [DMEmbed],
                        components: [...actionRows, cancelbutton],
                      });
                    } else {
                      const DMEmbed = new EmbedBuilder()
                        .addFields({
                          name: `Question \`${nextQuestionIndex + 1}/${botQuestions.length}\``,
                          value: nextQuestion.content,
                        })
                        .setColor("#3f7ff1")
                        .setFooter({
                          text: 'Click "cancel" to cancel the verification.',
                        });
                      startverification = await dmChannel.send({
                        embeds: [DMEmbed],
                        components: [cancelbutton],
                      });
                    }
                  } else {
                    collector.stop("completed");
                    cancelcollector.stop("completed");
                  }
                } catch (error) {
                  console.error(
                    `Error handling text message for user ${userid}:`,
                    error,
                  );
                  await collected.author
                    .send(
                      "An error occurred processing your answer. Please try again.",
                    )
                    .catch(() => {});
                } finally {
                  isProcessing = false;
                }
              });

              collector.on("end", async (collected, reason) => {
                try {
                  cancelcollector.stop();
                  console.log(
                    `Verification ended for user ${userid} with reason: ${reason}`,
                  );

                  if (reason === "completed") {
                    resolve([reason, responses]);
                  } else if (reason === "canceled") {
                    reject(new Error("Verification was canceled"));
                  } else if (reason === "time") {
                    const timeoutEmbed = new EmbedBuilder()
                      .setTitle("Verification Timed Out")
                      .setDescription(
                        "The verification process has timed out. Please restart the verification.",
                      )
                      .setColor("#ff0000");

                    await dmChannel
                      .send({ embeds: [timeoutEmbed] })
                      .catch(() => {});
                    reject(new Error("Verification timed out"));
                  } else {
                    reject(
                      new Error(`Verification ended unexpectedly: ${reason}`),
                    );
                  }
                } catch (error) {
                  console.error(
                    `Error in verification end handler for user ${userid}:`,
                    error,
                  );
                  reject(error);
                }
              });
            } catch (error) {
              reject(error);
            }
          })();
        });
      }
    } catch (error) {
      if (
        !error.toString().includes("Verification was canceled") &&
        !error.toString().includes("Verification timed out")
      ) {
        throw error;
      }
    }
  } catch (error) {
    console.error("Verification error:", error);
    // throw error;

    await interaction.user.send({
      content: `An error occurred during the verification process! Please try again later or contact the server staff/[Melpo's Support server](https://discord.gg/jjGAwwwxZz). (${error.message})`,
    });
  } finally {
    activeVerifications.delete(interaction.user.id);
  }
};;

async function constructApplicationEmbed(
  user,
  questions,
  answers,
  serverId,
  client,
  pingStaffRoleId,
  appName,
) {
  const guild = await client.guilds.fetch(serverId);
  const guildmember = await guild.members.fetch(user.id);

  const invitetracker = await InviteTracker.findOne({
    where: { unique_id: `${user.id}_${serverId}` },
  });

  const headerText = `${pingStaffRoleId ? pingStaffRoleId?.map((role) => `<@&${role}>`).join(", ") + "\n" : ""}### ${user.globalName ?? user.username}'s ${appName}\n[Avatar Reverse Image Search](https://lens.google.com/uploadbyurl?url=${user.displayAvatarURL({ size: 2048, format: "png" })})\n**Username:** \`${user.username}\` <@${user.id}>\n**User ID:** \`${user.id}\`\n**Account created:** <t:${Math.floor(user.createdAt / 1000)}:R>\n**Joined server:** <t:${Math.floor(guildmember.joinedTimestamp / 1000)}:R>${invitetracker ? `\n**Invited by:** <@${invitetracker.id}> (\`${invitetracker.code}\` has \`${invitetracker.uses}\` uses)` : ""}`;

  const container = new ContainerBuilder({
    accent_color: 4161521,
  })
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder({
            content: headerText,
          }),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder({
            media: { url: user.displayAvatarURL({ size: 1024 }) },
          }),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder({
        spacing: SeparatorSpacingSize.Small,
      }),
    );

  if (answers.length > 0) {
    let totalCharacterCount = headerText.length;
    let absoluteTotalCharacterCount = 0;
    const MAX_TOTAL_CHARACTERS = 3800;
    let wasTruncated = false;
    const fullTextLines = [];

    answers.forEach((answer, index) => {
      absoluteTotalCharacterCount += questions[index].content.length + (answer.content?.length || 0);
    });

    answers.forEach((answer, index) => {
      const questioncontent = questions[index].content.replace(/(\*\*|__|\*|~~|`|>)/g, "");
      const rawContent = answer.content || "No answer provided";
      fullTextLines.push(`Q${index + 1}: ${questioncontent}`);
      fullTextLines.push(`Answer: ${rawContent}`);
      if (answer.attachments && answer.attachments.length > 0) {
        fullTextLines.push(`Attachments: ${answer.attachments.join(', ')}`);
      }
      fullTextLines.push('');

      if(totalCharacterCount >= MAX_TOTAL_CHARACTERS) {
        wasTruncated = true;
        return;
      }

      const questionText = absoluteTotalCharacterCount >= MAX_TOTAL_CHARACTERS ? `**${index + 1}.** **${questioncontent.slice(0, 10)}...**` : `**${index + 1}.** **${questioncontent}**`;
      const answertext = answer.content || "No answer provided";

      let formattedField = [
        questionText,
        `_ _ ${answertext}`,
      ].join("\n");

      if (totalCharacterCount + formattedField.length > MAX_TOTAL_CHARACTERS) {
        const remainingCharacters = MAX_TOTAL_CHARACTERS - totalCharacterCount;
        if (remainingCharacters > 100) { // Only add if there's meaningful space left
          formattedField = formattedField.slice(0, remainingCharacters - 3) + "...";
          wasTruncated = true;
          console.log(`Truncated field ${index + 1} to fit within total limits.`);
        } else {
          wasTruncated = true;
          console.log(`Field ${index + 1} exceeds total limit and will not be added.`);
          return;
        }
      }

      totalCharacterCount += formattedField.length;

      container.addTextDisplayComponents(
        new TextDisplayBuilder({
          content: formattedField,
        }),
      );

      if (answer.attachments && answer.attachments.length > 0) {
        const allurls = answer.attachments;
        const mappedurls = allurls?.map((url) => ({
          media: {
            url: url,
          },
        }));
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder({
            items: mappedurls,
          }),
        );
      }
    });

    const fullText = wasTruncated ? fullTextLines.join('\n') : null

    if (wasTruncated && fullText) {
      const safeAppName = appName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const name = `${user.id}_${safeAppName}.txt`;
      const buffer = Buffer.from(fullText, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name });
      container.addFileComponents(
        new FileBuilder().setURL(`attachment://${name}`),
      );

      return {
        container,
        wasTruncated,
        fullText,
        attachment,
      };
    }

    return {
      container,
      wasTruncated,
      fullText: fullText
    };
  }

  return { container, wasTruncated: false, fullText: null };
}

async function processVerificationResult(
  user,
  reason,
  responses,
  interaction,
  botQuestions,
  dmChannel,
  pingStaffRoleId,
  guildId,
  verifyLogsChannel,
  finishmessage,
  client,
  useThreads,
  appName,
  applicationId,
) {
  if (reason === "completed") {
    // Process collected responses and send to verification review channel
    updateVerifications();

    const finishEmbedTitle = replaceplaceholder(
      finishmessage?.title,
      interaction.user.globalName ?? interaction.user.username,
      interaction.guild.name,
    );
    const finishEmbedDescription = replaceplaceholder(
      finishmessage?.description,
      interaction.user.globalName ?? interaction.user.username,
      interaction.guild.name,
    );
      const finishEmbedimage = finishmessage?.image;
      const finishImageAsset = resolveImage(finishEmbedimage);

    const endEmbed = new EmbedBuilder()
      .setTitle(
        finishEmbedTitle && finishEmbedTitle.trim() ? finishEmbedTitle : null,
      )
      .setDescription(finishEmbedDescription)
      .setColor(finishmessage?.color || "#008000")
      .setFooter({ text: `Application: ${appName}` })
      .setImage(finishImageAsset.embedUrl);

    dmChannel.send({
      embeds: [endEmbed],
    });

    user = user || interaction.user;

    const { container, attachment } = await constructApplicationEmbed(
      user,
      botQuestions,
      responses,
      interaction.guild.id,
      client,
      pingStaffRoleId,
      appName,
    );

    //create the buttons
    const verify = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_${applicationId}_${interaction.user.id}`)
        .setLabel("Accept")
        .setStyle("Success"),
      new ButtonBuilder()
        .setCustomId(`deny_${applicationId}_${interaction.user.id}`)
        .setLabel("Deny")
        .setStyle("Danger"),
      new ButtonBuilder()
        .setCustomId(`reasondeny_${applicationId}_${interaction.user.id}`)
        .setLabel("Deny with reason")
        .setStyle("Danger"),
      new ButtonBuilder()
        .setCustomId(`question_${applicationId}_${interaction.user.id}`)
        .setLabel("Question")
        .setStyle("Primary"),
      new ButtonBuilder()
        .setCustomId(`action_${applicationId}_${interaction.user.id}`)
        .setLabel("Kick")
        .setStyle("Secondary"),
    );

    let channelsent;

    const sendPayload = {
      flags: [MessageFlags.IsComponentsV2],
      components: [container, verify],
    };

    if (attachment) {
      sendPayload.files = [attachment];
    }

    channelsent = await verifyLogsChannel.send(sendPayload);
    if (useThreads === true) {
      await channelsent.startThread({
        name: `${user.globalName ?? user.username}'s Verification`,
      });
    }
    
    try {
      let verification = await Verification.findOne({
        where: { userId: user.id },
      });
      if (verification) {
        addMessageId(verification, guildId, applicationId, channelsent.id);
        await verification.save();
      } else {
        await Verification.create({
          userId: user.id,
          guildVerifications: { [guildId]: { [applicationId]: [channelsent.id] } },
        });
      }
    } catch (error) {
      console.error("Error setting user verification:", error);
    }
  }
}

function replaceplaceholder(string, globalUserName, guildName) {
  if (!string) return null;
  const result = string
    .replace(/{username}/g, globalUserName)
    ?.replace(/\${interaction.guild.name}/g, guildName);
  return result && result.trim() ? result : null;
}

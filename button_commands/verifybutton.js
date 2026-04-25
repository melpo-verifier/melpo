const {
  Verification,
  InviteTracker,
  AdTexts,
  UserBilling,
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
    if (now - session.timestamp > 4 * 60 * 60 * 1000) {
      // older than 4 hours gets deleted
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
    const timeLeft = Math.ceil((1000 - timeSinceLastAttempt) / 1000); //EDIT THIS BEFORE PUSH

    if (timeLeft > 0) {
      return await interaction.editReply({
        content: `Please wait ${timeLeft} seconds before starting another application.`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      rateLimitMap.delete(rateLimitKey);
    }
  }

  // Check if the user already has an active verification session
  if (activeVerifications.has(interaction.user.id)) {
    return await interaction.editReply({
      content: `<@${interaction.user.id}>, you already have an active application session! Please complete or cancel it before starting a new one.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  rateLimitMap.set(rateLimitKey, Date.now());

  try {
    const user = interaction.user;
    const guildId = interaction.guild.id;

    // Find the application by ID
    const { application, error } = await getApplicationByIdWithFallback(applicationId, guildId);

    if (error || !application) {
      return await interaction.editReply({
        content: `This application setup is not configured correctly. Please contact the server staff. (Application not found)`,
        flags: MessageFlags.Ephemeral,
      });
    }

    applicationId = application.id;

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
          content: `No questions are configured. Please contact the server staff.`,
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

        //parse the internal mcq and regex
        parsed.mcq = Array.isArray(parsed.mcq) ? parsed.mcq : [];
        parsed.regexBranches = Array.isArray(parsed.regexBranches) ? parsed.regexBranches : [];

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

    const isSetupComplete = verifyChannelId && verifyLogsChannelId && parsedQuestions.length > 0;

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
        content: `<@${user.id}>, the application review channel could not be found! Please contact server staff.`,
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
        content: `<@${user.id}>, I don't have permissions to send messages in the application review channel!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      activeVerifications.has(user.id) &&
      activeVerifications.get(user.id).startTime + 3600000 < Date.now()
    ) {
      console.error(
        "User has an active application session but it has been more than an hour. Clearing the session. THIS SHOULDNT HAPPEN",
      );
      activeVerifications.delete(user.id);
    }

    // Generate a unique identifier for this verification session
    const sessionId = uuidv4();

    // Create DM channel and send start Embed
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

      let startmessage;

      try {
        startmessage = await dmChannel.send({
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

      const startedEmbed = new EmbedBuilder()
        .setTitle("Verification Started")
        .setDescription(
          `Verification started, check your DMs or [click here](https://discord.com/channels/@me/${dmChannel.id}/${startmessage.id})!`,
        )
        .setColor("#3f7ff1");

      await interaction.editReply({
        embeds: [startedEmbed],
        flags: MessageFlags.Ephemeral,
      });

      activeVerifications.set(user.id, {
        sessionId: sessionId,
        startTime: Date.now(),
      });

      if ( //sharded instances
        // client.user.id === "849613551080701983" ||
        // client.user.id === "916372883087974440"
        client.cluster
      ) {
        await client.cluster
          .broadcastEval(Verificationfunc, {
            context: {
              userid: user.id,
              dmChannelId: dmChannel.id,
              botQuestions: parsedQuestions,
              cancelbutton: cancelbutton.toJSON(),
              sessionId: sessionId,

            },
            cluster: 0,
          })
          .then(async (results) => {
            const [reason, responses] = results[0];
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
      } else { //non sharded instances
        try {
          const [reason, responses] = await Verificationfunc(client, {
            userid: user.id,
            dmChannelId: dmChannel.id,
            botQuestions: parsedQuestions,
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
            !error.toString().includes("Verification was canceled") &&
            !error.toString().includes("Verification timed out")
          ) {
            throw error;
          }
          activeVerifications.delete(user.id);
        }
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
    await interaction.followUp({
      content: `An error occurred during the verification process! Please try again later or contact the server staff/[Melpo's Support server](https://discord.gg/jjGAwwwxZz). (${error.message})`,
      flags: MessageFlags.Ephemeral
    }).catch(() => { });
  } finally {
    activeVerifications.delete(interaction.user.id);
  }
};

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

  const [guildmember, invitetracker] = await Promise.all([
    guild.members.fetch(user.id).catch(() => null),
    InviteTracker.findOne({
      where: { unique_id: `${user.id}_${serverId}` },
    })
  ]);

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

      if (totalCharacterCount >= MAX_TOTAL_CHARACTERS) {
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

    if (wasTruncated === false) {
      if (Math.random() < 0.02) {

        const serverOwner = guild?.ownerId;
        const isPaidUser = await UserBilling.findOne({ where: { user_id: serverOwner } });

        if (!isPaidUser) {
          const adTexts = await AdTexts.findAll({
            where: { type: "application" }
          });

          if (adTexts.length > 0) {
            const randomAd = adTexts[Math.floor(Math.random() * adTexts.length)];
            container.addTextDisplayComponents(
              new TextDisplayBuilder({
                content: '\n-# ' + randomAd.text,
              }),
            );
          }
        }
      }
    }

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

    user = user || interaction.user;

    const containerResult = await constructApplicationEmbed(
      user,
      botQuestions,
      responses,
      interaction.guild.id,
      client,
      pingStaffRoleId,
      appName,
    );

    if (!containerResult || !containerResult.container) {
      //try to send image to user:
      await dmChannel.send({ content: "An error occurred while processing your verification. This can happen when you left or have been kicked from the server during your application." }).catch(() => { });
      return;
    }

    const { container, attachment } = containerResult;

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

    await dmChannel.send({
      embeds: [endEmbed],
    });

    if (useThreads === true) {
      await channelsent.startThread({
        name: `${user.globalName ?? user.username}'s Verification`,
      });
    }

    try {
      const [verification, created] = await Verification.findOrCreate({
        where: { userId: user.id },
        defaults: {
          guildVerifications: { [guildId]: { [applicationId]: [channelsent.id] } },
        },
      });

      if (!created) {
        addMessageId(verification, guildId, applicationId, channelsent.id);
        await verification.save();
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


async function Verificationfunc(
  c,
  { userid, dmChannelId, botQuestions, cancelbutton, sessionId },
) {
  return new Promise((resolve, reject) => {
    const {
      ButtonBuilder,
      ActionRowBuilder,
      EmbedBuilder,
      StringSelectMenuBuilder,
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

    // Map question IDs
    const questionMap = new Map();
    const questionIndexMap = new Map();
    botQuestions.forEach((question, index) => {
      if (!question.id) {
        question.id = `question-${index}`;
      }
      questionMap.set(question.id, question);
      questionIndexMap.set(question.id, index);
    });

    function getSequentialNextQuestionId(currentQuestionIndex) {
      return botQuestions[currentQuestionIndex + 1]?.id ?? null;
    }

    function resolveNextQuestionId(nextQuestionId, currentQuestionIndex) {
      if (nextQuestionId === "end") {
        return "end";
      }

      if (nextQuestionId === undefined || nextQuestionId === null || nextQuestionId === "") {
        return getSequentialNextQuestionId(currentQuestionIndex);
      }

      return nextQuestionId;
    }

    function getNextQuestionId(currentQuestion, currentQuestionIndex, selectedOptionIndex, answerText, selectedOptionCount = 0) {
      // If MCQ with multiple selections, use multiSelectNextQuestionId.
      if (
        selectedOptionCount > 1 &&
        Object.prototype.hasOwnProperty.call(currentQuestion, "multiSelectNextQuestionId")
      ) {
        return resolveNextQuestionId(currentQuestion.multiSelectNextQuestionId, currentQuestionIndex);
      }

      // If MCQ with a selected option and that option has a nextQuestionId
      if (selectedOptionIndex !== null && currentQuestion.mcq && currentQuestion.mcq.length > 0) {
        const selectedOption = currentQuestion.mcq[selectedOptionIndex];
        if (selectedOption && Object.prototype.hasOwnProperty.call(selectedOption, "nextQuestionId")) {
          return resolveNextQuestionId(selectedOption.nextQuestionId, currentQuestionIndex);
        }
      }

      // Check regex branches
      if (currentQuestion.regexBranches && currentQuestion.regexBranches.length > 0) {
        for (const branch of currentQuestion.regexBranches) {
          if (branch.pattern) {
            try {
              const regex = new RegExp(branch.pattern, "i"); // case-insensitive
              if (regex.test(answerText)) {
                if (Object.prototype.hasOwnProperty.call(branch, "nextQuestionId")) {
                  return resolveNextQuestionId(branch.nextQuestionId, currentQuestionIndex);
                }
                return getSequentialNextQuestionId(currentQuestionIndex);
              }
            } catch (error) {
              console.error(`Invalid regex pattern "${branch.pattern}":`, error);
            }
          }
        }
      }

      // Default, use nextQuestionId, otherwise just follow order.
      if (Object.prototype.hasOwnProperty.call(currentQuestion, "nextQuestionId")) {
        return resolveNextQuestionId(currentQuestion.nextQuestionId, currentQuestionIndex);
      }
      return getSequentialNextQuestionId(currentQuestionIndex);
    }

    function createQuestionEmbed(question, responselength,) {
      const DMEmbed = new EmbedBuilder()
        .setColor("#3f7ff1")
        .setFooter({
          text: 'Click "cancel" to cancel the verification.',
        });

      let actionRow = new ActionRowBuilder()
      if (question.mcq && question.mcq.length > 0) {

        //buttons if 5 buttons or less, select menu if more
        if (question.mcq.length <= 5 && question.allowMultipleSelections !== true) {
          question.mcq.forEach((option, index) => {
            const buttonIndex = index + 1;

            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(buttonIndex.toString())
                .setLabel(buttonIndex.toString())
                .setStyle("Primary")
            );
          });

          const mcqWithEmojis = question.mcq
            .map(
              (option, index) =>
                `${numberToEmoji[index]} ${option?.label ?? option}`,
            )
            .join("\n ");

          DMEmbed.addFields({
            name: `Question \`${responselength + 1}\``,
            value: `${question.content}\n\n${mcqWithEmojis}`,
          })
        }
        else {
          const options = question.mcq.slice(0, 25).map((option, index) => ({
            label: (option.label || option).toString().slice(0, 100),
            value: (index + 1).toString(),
          }));
          actionRow.addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("mcq_select")
              .addOptions(options)
              .setPlaceholder("Select an option")
              .setMinValues(question.allowMultipleSelections ? 1 : 1)
              .setMaxValues(question.allowMultipleSelections ? options.length : 1)
          );

          DMEmbed.addFields({
            name: `Question \`${responselength + 1}\``,
            value: `${question.content}`,
          })
        }
      } else {
        DMEmbed.addFields({
          name: `Question \`${responselength + 1}\``,
          value: question.content,
        })
        actionRow = null;
      }

      return { DMEmbed, actionRow };

    }

    (async () => {
      try {
        const user = await c.users.fetch(userid);
        const dmChannel = await c.channels.fetch(dmChannelId);
        let startverification;

        // Get the first question
        const firstQuestion = botQuestions[0];
        if (!firstQuestion) {
          reject(new Error("No questions found in verification"));
          return;
        }

        // Send the first question
        const { DMEmbed, actionRow } = createQuestionEmbed(firstQuestion, 0);
        startverification = await dmChannel.send({
          embeds: [DMEmbed],
          components: [actionRow, cancelbutton].filter(Boolean),
        });

        const collector = dmChannel.createMessageCollector({
          filter: (m) => !m.author.bot,
          time: 3600000,
        });
        const cancelcollector = dmChannel.createMessageComponentCollector({
          filter: (i) => i.user.id === user.id,
          time: 3600000,
        });

        const responses = [];
        let isProcessing = false;
        let processingQueue = Promise.resolve();
        let currentQuestionId = firstQuestion.id;
        let currentQuestionIndex = questionIndexMap.get(firstQuestion.id) ?? 0;

        // Handle button interactions
        cancelcollector.on("collect", async (i) => {
          processingQueue = processingQueue.then(async () => {
            try {
              await i.deferUpdate().catch(() => { console.error("Failed to defer update for cancel button") });

              if (isProcessing) {
                return; // Ignore if already processing
              }

              isProcessing = true;

              // handle cancel button
              if (i.customId === `cancelverification-${sessionId}`) {
                collector.stop("canceled");
                cancelcollector.stop("canceled");
                const cancelEmbed = new EmbedBuilder()
                  .setTitle("Application Canceled")
                  .setDescription(
                    `The application has been canceled. Feel free to restart the application just like you did before!`,
                  )
                  .setColor("#ff0000");

                await startverification.edit({
                  embeds: [cancelEmbed],
                  components: [],
                });
                reject(new Error("Application was canceled"));
                return;
              }

              // Handle MCQ interactions
              if (!i.customId.includes("cancel")) {
                const currentQuestion = questionMap.get(currentQuestionId);

                if (!currentQuestion) {
                  console.error(`Question with ID ${currentQuestionId} not found`);
                  isProcessing = false;
                  return;
                }

                if (
                  !currentQuestion.mcq ||
                  currentQuestion.mcq.length === 0
                ) {
                  console.error(
                    `Invalid MCQ question at index ${currentQuestionId}`,
                  );
                  isProcessing = false;
                  return;
                }

                let selectedOptionIndex = null;
                let selectedOptions = [];
                let fieldValue = "";

                if (i.isButton()) {
                  selectedOptionIndex = parseInt(i.customId) - 1;
                  if (selectedOptionIndex < 0 || selectedOptionIndex >= currentQuestion.mcq.length) {
                    console.error(
                      `Invalid answer index ${selectedOptionIndex} for question ${currentQuestionId}`,
                    );
                    isProcessing = false;
                    return;
                  }

                  const mcqanswer = currentQuestion.mcq[selectedOptionIndex]?.label ?? currentQuestion.mcq[selectedOptionIndex];
                  fieldValue = `${numberToEmoji[selectedOptionIndex]} ${mcqanswer}`;
                }
                else if (i.isStringSelectMenu()) {
                  const selectedIndexes = i.values.map(value => parseInt(value) - 1);
                  selectedOptions = selectedIndexes.map((index) => {
                    if (index < 0 || index >= currentQuestion.mcq.length) {
                      console.error(
                        `Invalid answer index ${index} for question ${currentQuestionId}`,
                      );
                      return null;
                    }
                    return {
                      index: index,
                      option: currentQuestion.mcq[index]
                    };
                  }).filter(item => item !== null);

                  fieldValue = selectedOptions.map((option) => `${numberToEmoji[option.index]} ${option.option?.label ?? option.option}`).join("\n ");

                  if (selectedOptions.length > 0) {
                    selectedOptionIndex = selectedOptions[0].index;
                  }
                }

                const answerEmbed = new EmbedBuilder(startverification.embeds[0],)
                  .setColor("#008000")
                  .addFields({
                    name: `Answer`,
                    value: fieldValue,
                  });

                await startverification.edit({
                  embeds: [answerEmbed],
                  components: [],
                });

                const responseAnswer = {
                  content: fieldValue,
                };
                responses.push(responseAnswer);
                collector.resetTimer();
                cancelcollector.resetTimer();

                // Determine next question based on branching
                const nextQuestionId = getNextQuestionId(
                  currentQuestion,
                  currentQuestionIndex,
                  selectedOptionIndex,
                  fieldValue,
                  i.isStringSelectMenu() ? selectedOptions.length : 1,
                );

                // Check if it reached the end
                if (nextQuestionId === null || nextQuestionId === "end") {
                  cancelcollector.stop("completed");
                  collector.stop("completed");
                  return;
                }

                // Get the next question
                const nextQuestion = questionMap.get(nextQuestionId);
                if (!nextQuestion) {
                  console.error(`Next question with ID ${nextQuestionId} not found`);
                  cancelcollector.stop("completed");
                  collector.stop("completed");
                  return;
                }

                currentQuestionId = nextQuestionId;
                currentQuestionIndex = questionIndexMap.get(nextQuestionId) ?? (currentQuestionIndex + 1);

                const { DMEmbed, actionRow } = createQuestionEmbed(nextQuestion, responses.length);

                startverification = await dmChannel.send({
                  embeds: [DMEmbed],
                  components: [actionRow, cancelbutton].filter(Boolean),
                });
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
        });

        // Handle text messages
        collector.on("collect", async (collected) => {
          processingQueue = processingQueue.then(async () => {

            try {
              if (isProcessing) {
                return;
              }

              isProcessing = true;

              const currentQuestion = questionMap.get(currentQuestionId);

              if (!currentQuestion) {
                isProcessing = false;
                return;
              }


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
              collector.resetTimer();
              cancelcollector.resetTimer();

              // Determine next question based on regex branching or default
              const nextQuestionId = getNextQuestionId(currentQuestion, currentQuestionIndex, null, answercontent);

              // Check if it reached the end
              if (nextQuestionId === null || nextQuestionId === "end") {
                collector.stop("completed");
                cancelcollector.stop("completed");
                return;
              }

              // Get the next question
              const nextQuestion = questionMap.get(nextQuestionId);
              if (!nextQuestion) {
                console.error(`Next question with ID ${nextQuestionId} not found`);
                collector.stop("completed");
                cancelcollector.stop("completed");
                return;
              }

              currentQuestionId = nextQuestionId;
              currentQuestionIndex = questionIndexMap.get(nextQuestionId) ?? (currentQuestionIndex + 1);

              const { DMEmbed, actionRow } = createQuestionEmbed(nextQuestion, responses.length);
              startverification = await dmChannel.send({
                embeds: [DMEmbed],
                components: [actionRow, cancelbutton].filter(Boolean),
              });
            } catch (error) {
              console.error(
                `Error handling text message for user ${userid}:`,
                error,
              );
              await collected.author
                .send(
                  "An error occurred processing your answer. Please try again.",
                )
                .catch(() => { });
            } finally {
              isProcessing = false;
            }
          });
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
                .catch(() => { });
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

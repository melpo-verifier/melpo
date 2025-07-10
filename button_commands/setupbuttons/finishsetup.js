const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const { ServerConfig } = require("../../dbObjects.js");
const fs = require("fs");
const path = require("path");
const {
  createTemporarySetup,
  deleteTemporarySetup,
} = require("../../js/tempconfigfuncs.js");

module.exports = async ({ interaction, client }) => {
  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  const [serverConfig] = await ServerConfig.findOrCreate({
    where: { server_id: interaction.guild.id },
  });

  const questions = temporarySetup.questions || serverConfig.questions;
  const reviewChannel =
    temporarySetup.reviewchannel === "deleted"
      ? null
      : temporarySetup.reviewchannel || serverConfig.reviewchannel;
  const verifyLogsChannel =
    temporarySetup.verifylogs === "deleted"
      ? null
      : temporarySetup.verifylogs || serverConfig.verifylogs;
  const verifyChannel =
    temporarySetup.verifychannel === "deleted"
      ? null
      : temporarySetup.verifychannel || serverConfig.verifychannel;
  const verificationwelcomechannel =
    temporarySetup.verificationwelcomechannel === "deleted"
      ? null
      : temporarySetup.verificationwelcomechannel ||
        serverConfig.verificationwelcomechannel;

  const verifiedRole =
    (temporarySetup.verifiedrole || serverConfig.verifiedrole)?.length > 0
      ? temporarySetup.verifiedrole || serverConfig.verifiedrole
      : null;
  const autoRole =
    (temporarySetup.autorole || serverConfig.autorole)?.length > 0
      ? temporarySetup.autorole || serverConfig.autorole
      : null;
  const unverifiedRole =
    (temporarySetup.unverifiedrole || serverConfig.unverifiedrole)?.length > 0
      ? temporarySetup.unverifiedrole || serverConfig.unverifiedrole
      : null;
  const pingRole =
    (temporarySetup.pingrole || serverConfig.pingrole)?.length > 0
      ? temporarySetup.pingrole || serverConfig.pingrole
      : null;
  const managerRole =
    (temporarySetup.managerrole || serverConfig.managerrole)?.length > 0
      ? temporarySetup.managerrole || serverConfig.managerrole
      : null;
  const useThreads =
    temporarySetup.usethreads !== undefined
      ? temporarySetup.usethreads
      : serverConfig.usethreads || false;

  if (
    !(
      verifyChannel &&
      reviewChannel &&
      verifiedRole &&
      questions &&
      questions.length > 0
    )
  )
    return interaction.reply({
      content:
        "You need to set up all the *required* channels, roles and questions before finishing the setup.",
      flags: MessageFlags.Ephemeral,
    });

  const verifychannelembed = {
    ...serverConfig.verifychannelembed,
    ...temporarySetup.verifychannelembed,
  };

  const startmessage = {
    ...serverConfig.startmessage,
    ...temporarySetup.startmessage,
  };

  const finishmessage = {
    ...serverConfig.finishmessage,
    ...temporarySetup.finishmessage,
  };

  const verifymessage = {
    ...serverConfig.verifymessage,
    ...temporarySetup.verifymessage,
  };

  const verificationwelcomemessage = {
    ...serverConfig.verificationwelcomemessage,
    ...temporarySetup.verificationwelcomemessage,
  };

  cleanConfig(verifychannelembed);
  cleanConfig(startmessage);
  cleanConfig(finishmessage);
  cleanConfig(verifymessage);
  cleanConfig(verificationwelcomemessage);

  const color =
    verifychannelembed.color === "deleted"
      ? null
      : verifychannelembed.color || null;
  const title =
    verifychannelembed.title === "deleted"
      ? null
      : verifychannelembed.title || null;
  const description =
    verifychannelembed.description === "deleted"
      ? null
      : verifychannelembed.description || null;

  if (questions.length === 0) {
    return interaction.reply({
      content: "You need to add at least one question.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const imageCategories = [
    "verifychannelembed",
    "startmessage",
    "finishmessage",
    "verifymessage",
    "verificationwelcomemessage",
  ];

  for (const category of imageCategories) {
    if (temporarySetup[category]?.image === "deleted") {
      console.log(
        `Skipping validation for ${category}: image marked for deletion`,
      );
      continue;
    }

    if (temporarySetup[category]?.image) {
      const imagePath = path.join(
        __dirname,
        "..",
        "..",
        temporarySetup[category].image,
      );
      try {
        await fs.promises.access(imagePath, fs.constants.F_OK);
        console.log(`Image exists: ${imagePath}`);
      } catch {
        console.error(`Image not found: ${imagePath}`);
        temporarySetup[category].image = null;
        throw new Error(`Image not found: ${imagePath}`);
      }
    }
  }

  if (temporarySetup.verifychannelembed?.image) {
    await deleteOldImages(
      interaction.guild.id,
      verifychannelembed.image,
      "images/verifychannelembed",
    );
    verifychannelembed.image = verifychannelembed.image
      ? verifychannelembed.image?.replace(/_temp/, "")
      : null;
  }
  if (temporarySetup.startmessage?.image) {
    await deleteOldImages(
      interaction.guild.id,
      startmessage.image,
      "images/startmessage",
    );
    startmessage.image = startmessage.image
      ? startmessage.image?.replace(/_temp/, "")
      : null;
  }
  if (temporarySetup.finishmessage?.image) {
    await deleteOldImages(
      interaction.guild.id,
      finishmessage.image,
      "images/finishmessage",
    );
    finishmessage.image = finishmessage.image
      ? finishmessage.image?.replace(/_temp/, "")
      : null;
  }
  if (temporarySetup.verifymessage?.image) {
    await deleteOldImages(
      interaction.guild.id,
      verifymessage.image,
      "images/verifymessage",
    );
    verifymessage.image = verifymessage.image
      ? verifymessage.image?.replace(/_temp/, "")
      : null;
  }
  if (temporarySetup.verificationwelcomemessage?.image) {
    await deleteOldImages(
      interaction.guild.id,
      verificationwelcomemessage.image,
      "images/verificationwelcomemessage",
    );
    verificationwelcomemessage.image = verificationwelcomemessage.image
      ? verificationwelcomemessage.image?.replace(/_temp/, "")
      : null;
  }

  Object.assign(serverConfig, {
    reviewchannel: reviewChannel,
    verifylogs: verifyLogsChannel,
    verifychannel: verifyChannel,
    verifiedrole: verifiedRole,
    questions: questions,
    verifychannelembed: verifychannelembed,
    startmessage: startmessage,
    finishmessage: finishmessage,
    verifymessage: verifymessage,
    verificationwelcomemessage: verificationwelcomemessage,
    autorole: autoRole,
    unverifiedrole: unverifiedRole,
    pingrole: pingRole,
    managerrole: managerRole,
    verificationwelcomechannel: verificationwelcomechannel,
    usethreads: useThreads,
  });

  await serverConfig.save();

  //check if there already is verification message in the verifychannel, if not then send new one
  const verifyChannelObj = interaction.guild.channels.cache.get(verifyChannel);
  if (!verifyChannelObj) {
    return interaction.reply({
      content:
        "The user verification channel has been deleted. Please set up the user verification channel again.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const verificationMessages = await verifyChannelObj.messages.fetch();
  const verificationMessage = verificationMessages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].footer &&
      m.embeds[0].footer.text ===
        "Thanks for verifying! - Developed by milo_dev",
  );

  if (!verificationMessage) {
    const verificationembed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title ?? null)
      .setDescription(description)
      .setImage(
        verifychannelembed.image
          ? `attachment://verifychannelimage.${verifychannelembed.image.split(".").pop()}`
          : null,
      )
      .setFooter({ text: "Thanks for verifying! - Developed by milo_dev" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("verifybutton")
        .setLabel("Verify")
        .setStyle("Success"),
    );

    var attachment;

    if (verifychannelembed.image) {
      if (fs.existsSync(verifychannelembed.image)) {
        try {
          attachment = new AttachmentBuilder(verifychannelembed.image).setName(
            `verifychannelimage.${path.extname(verifychannelembed.image).slice(1)}`,
          );
        } catch (error) {
          console.error("Error creating attachment:", error);
        }
      } else {
        console.error(`File not found: ${verifychannelembed.image}`);
      }
    }

    await interaction.guild.channels.cache
      .get(verifyChannel)
      .send({
        embeds: [verificationembed],
        components: [row],
        files: attachment ? [attachment] : [],
      });
  } else {
    //check if the latest message is up to date with the current setup and if not then update it
    const verifymessage = verificationMessage.embeds[0];

    const verifymessageEmbed = new EmbedBuilder(verifymessage)
      .setColor(color)
      .setTitle(title ?? null)
      .setDescription(description)
      .setImage(
        verifychannelembed.image
          ? `attachment://verifychannelimage.${verifychannelembed.image.split(".").pop()}`
          : null,
      )
      .setFooter({ text: "Thanks for verifying! - Developed by milo_dev" });

    if (verifychannelembed.image) {
      if (fs.existsSync(verifychannelembed.image)) {
        // console.log('image exists!')
        try {
          attachment = new AttachmentBuilder(verifychannelembed.image).setName(
            `verifychannelimage.${path.extname(verifychannelembed.image).slice(1)}`,
          );
        } catch (error) {
          console.error("Error creating attachment:", error);
        }
      } else {
        console.error(`File not found: ${verifychannelembed.image}`);
      }
    }

    if (
      verifymessage.title !== verifymessageEmbed.title ||
      verifymessage.description !== verifymessageEmbed.description ||
      verifymessage.image.url !== verifymessageEmbed.image.url ||
      verifymessage.color !== verifymessageEmbed.color
    ) {
      await verificationMessage.edit({
        embeds: [verifymessageEmbed],
        files: attachment ? [attachment] : [],
      });
    }
  }

  //delete the temporary setup from the datbase
  await deleteTemporarySetup(interaction.guild.id);

  const finishembed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Setup finished");

  if (interaction.customId.includes("firsttime")) {
    finishembed.setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe bot is now ready to verify users.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nThis is just the basic setup. You can further customize messages, roles and channels by running the \`/setup\` command again.`,
    );
  } else {
    finishembed.setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe bot is now ready to verify users.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nYou can redo or adjust this setup any time by running the \`/setup\` command again.`,
    );
  }

  await interaction.update({
    embeds: [finishembed],
    components: [],
    files: [],
  });
};

function cleanConfig(config) {
  for (const key in config) {
    if (config[key] === "deleted") {
      delete config[key];
    } else if (typeof config[key] === "object" && config[key] !== null) {
      cleanConfig(config[key]);

      if (Object.keys(config[key]).length === 0) {
        delete config[key];
      }
    }
  }
  return config;
}

async function deleteOldImages(serverId, newImagePath, imageDir) {
  try {
    const absoluteImageDir = path.join(__dirname, "..", "..", imageDir);

    if (!fs.existsSync(absoluteImageDir)) {
      await fs.promises.mkdir(absoluteImageDir, { recursive: true });
    }

    const files = await fs.promises.readdir(absoluteImageDir);

    if (!newImagePath || newImagePath === "deleted") {
      for (const file of files) {
        if (file.includes(serverId)) {
          await fs.promises.unlink(path.join(absoluteImageDir, file));
          console.log(`Deleted: ${file}`);
        }
      }
      return;
    }

    const absoluteNewPath = path.join(__dirname, "..", "..", newImagePath);

    await fs.promises.access(absoluteNewPath, fs.constants.F_OK);

    for (const file of files) {
      const fullPath = path.join(absoluteImageDir, file);
      if (file.includes(serverId) && fullPath !== absoluteNewPath) {
        await fs.promises.unlink(fullPath);
        console.log(`Deleted old: ${file}`);
      }
    }

    if (newImagePath.includes("_temp")) {
      const finalName = path.basename(newImagePath?.replace("_temp", ""));
      const finalPath = path.join(absoluteImageDir, finalName);
      await fs.promises.rename(absoluteNewPath, finalPath);
      console.log(`Renamed: ${path.basename(newImagePath)} -> ${finalName}`);
    }
  } catch (err) {
    console.error("File operation failed:", err);
    throw new Error(`Image operation failed: ${err.message}`);
  }
}

const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const { Application } = require("../../dbObjects.js");
const fs = require("fs");
const path = require("path");
const {
  deleteTempApplication,
} = require("../../js/tempconfigfuncs.js");
const { TempApplication } = require("../../dbObjects.js");

module.exports = async ({ interaction, client, context }) => {
  const appName = context[0] === "firsttime" ? context[1] : context[0];

  console.log(appName)
  const tempApp = await TempApplication.findOne({ where: { name: appName } });
  if (!tempApp) {
    return interaction.reply({
      content: "Temp setup not found.",
      flags: MessageFlags.Ephemeral,
    });
  }

  let existingApp = null;
  if (tempApp.name) {
    existingApp = await Application.findOne({ where: { name: tempApp.name } });
  }

  const questions = tempApp.questions && tempApp.questions.length > 0
    ? tempApp.questions
    : existingApp?.questions || [];
  const reviewChannel = tempApp.reviewchannel || existingApp?.reviewchannel;
  const verifyChannel = tempApp.verifychannel || existingApp?.verifychannel;
  const verifiedRole = (tempApp.verifiedrole && tempApp.verifiedrole.length > 0)
    ? tempApp.verifiedrole
    : (existingApp?.verifiedrole && existingApp.verifiedrole.length > 0 ? existingApp.verifiedrole : null);

  if (!(verifyChannel && reviewChannel && verifiedRole && questions && questions.length > 0)) {
    return interaction.reply({
      content: "You need to set up all the *required* channels, roles and questions before finishing the setup.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const verifychannelembed = tempApp.verifychannelembed || {};
  const startmessage = tempApp.startmessage || {};
  const finishmessage = tempApp.finishmessage || {};
  const verifymessage = tempApp.verifymessage || {};
  const verificationwelcomemessage = tempApp.verificationwelcomemessage || {};

  cleanConfig(verifychannelembed);
  cleanConfig(startmessage);
  cleanConfig(finishmessage);
  cleanConfig(verifymessage);
  cleanConfig(verificationwelcomemessage);

  const color = verifychannelembed.color || null;
  const title = verifychannelembed.title || null;
  const description = verifychannelembed.description || null;

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
    if (tempApp[category]?.image === "deleted") {
      console.log(`Skipping validation for ${category}: image marked for deletion`);
      continue;
    }

    if (tempApp[category]?.image) {
      const imagePath = path.join(__dirname, "..", "..", tempApp[category].image);
      try {
        await fs.promises.access(imagePath, fs.constants.F_OK);
        console.log(`Image exists: ${imagePath}`);
      } catch {
        console.error(`Image not found: ${imagePath}`);
        tempApp[category].image = null;
        throw new Error(`Image not found: ${imagePath}`);
      }
    }
  }

  if (tempApp.verifychannelembed?.image) {
    await deleteOldImages(interaction.guild.id, verifychannelembed.image, "images/verifychannelembed");
    verifychannelembed.image = verifychannelembed.image ? verifychannelembed.image.replace(/_temp/, "") : null;
  }
  if (tempApp.startmessage?.image) {
    await deleteOldImages(interaction.guild.id, startmessage.image, "images/startmessage");
    startmessage.image = startmessage.image ? startmessage.image.replace(/_temp/, "") : null;
  }
  if (tempApp.finishmessage?.image) {
    await deleteOldImages(interaction.guild.id, finishmessage.image, "images/finishmessage");
    finishmessage.image = finishmessage.image ? finishmessage.image.replace(/_temp/, "") : null;
  }
  if (tempApp.verifymessage?.image) {
    await deleteOldImages(interaction.guild.id, verifymessage.image, "images/verifymessage");
    verifymessage.image = verifymessage.image ? verifymessage.image.replace(/_temp/, "") : null;
  }
  if (tempApp.verificationwelcomemessage?.image) {
    await deleteOldImages(interaction.guild.id, verificationwelcomemessage.image, "images/verificationwelcomemessage");
    verificationwelcomemessage.image = verificationwelcomemessage.image ? verificationwelcomemessage.image.replace(/_temp/, "") : null;
  }

  // Build appData with only non-empty fields to allow defaults for new apps
  const appData = { server_id: interaction.guild.id, name: tempApp.name };
  const fields = [
    'questions', 'reviewchannel', 'verifylogs', 'verifychannel', 'verifiedrole',
    'verifychannelembed', 'startmessage', 'finishmessage', 'verifymessage',
    'verificationwelcomemessage', 'autorole', 'unverifiedrole', 'pingrole',
    'managerrole', 'verificationwelcomechannel', 'usethreads'
  ];

  for (const field of fields) {
    const value = tempApp[field];
    if (value != null && value !== '' &&
        (Array.isArray(value) ? value.length > 0 : true) &&
        (typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length > 0 : true)) {
      appData[field] = value;
    }
  }

  if (existingApp) {
    Object.assign(existingApp, appData);
    await existingApp.save();
  } else {
    existingApp = await Application.create(appData);
  }

  const verifyChannelObj = interaction.guild.channels.cache.get(verifyChannel);
  if (!verifyChannelObj) {
    return interaction.reply({
      content: "The user verification channel has been deleted. Please set up the user verification channel again.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const verificationMessages = await verifyChannelObj.messages.fetch();
  const verificationMessage = verificationMessages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].footer &&
      m.embeds[0].footer.text === `${tempApp.name}`,
  );

  // Use fallback logic for embed fields
  const embedColor = (tempApp.verifychannelembed?.color ?? existingApp?.verifychannelembed?.color) || "#3f7ff1";
  const embedTitle = tempApp.verifychannelembed?.title ?? existingApp?.verifychannelembed?.title ?? "Verification";
  const embedDescription = tempApp.verifychannelembed?.description ?? existingApp?.verifychannelembed?.description ?? "Please verify yourself by clicking the button below.";
  const embedImage = tempApp.verifychannelembed?.image ?? existingApp?.verifychannelembed?.image;

  if (!verificationMessage) {
    const verificationembed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setImage(
        embedImage
          ? `attachment://verifychannelimage.${embedImage.split(".").pop()}`
          : null,
      )
      .setFooter({ text: `${tempApp.name}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verifybutton_${existingApp.id}`)
        .setLabel("Verify")
        .setStyle("Success"),
    );

    let attachment;
    if (embedImage) {
      if (fs.existsSync(embedImage)) {
        attachment = new AttachmentBuilder(embedImage).setName(
          `verifychannelimage.${path.extname(embedImage).slice(1)}`,
        );
      }
    }

    await verifyChannelObj.send({
      embeds: [verificationembed],
      components: [row],
      files: attachment ? [attachment] : [],
    });
  } else {
    // Use the same fallback logic for updates
    const verifymessageEmbed = new EmbedBuilder(verificationMessage.embeds[0])
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setImage(
        embedImage
          ? `attachment://verifychannelimage.${embedImage.split(".").pop()}`
          : null,
      )
      .setFooter({ text: `${tempApp.name}` });

    let attachment;
    if (embedImage) {
      if (fs.existsSync(embedImage)) {
        attachment = new AttachmentBuilder(embedImage).setName(
          `verifychannelimage.${path.extname(embedImage).slice(1)}`,
        );
      }
    }

    if (
      verificationMessage.embeds[0].title !== verifymessageEmbed.title ||
      verificationMessage.embeds[0].description !== verifymessageEmbed.description ||
      verificationMessage.embeds[0].image?.url !== verifymessageEmbed.image?.url ||
      verificationMessage.embeds[0].color !== verifymessageEmbed.color
    ) {
      await verificationMessage.edit({
        embeds: [verifymessageEmbed],
        files: attachment ? [attachment] : [],
      });
    }
  }

  await deleteTempApplication(interaction.guild.id, { name: appName });

  const finishembed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Setup finished");

  if (interaction.customId.includes("firsttime")) {
    finishembed.setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe application "${tempApp.name}" is now ready to verify users.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nThis is just the basic setup. You can further customize messages, roles and channels by running the \`/setup edit "${tempApp.name}"\` command again.`,
    );
  } else {
    finishembed.setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe application "${tempApp.name}" has been updated.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nYou can redo or adjust this setup any time by running the \`/setup edit "${tempApp.name}"\` command again.`,
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
      const finalName = path.basename(newImagePath.replace("_temp", ""));
      const finalPath = path.join(absoluteImageDir, finalName);
      await fs.promises.rename(absoluteNewPath, finalPath);
      console.log(`Renamed: ${path.basename(newImagePath)} -> ${finalName}`);
    }
  } catch (err) {
    console.error("File operation failed:", err);
    throw new Error(`Image operation failed: ${err.message}`);
  }
}

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
  getApplicationById,
  getTempApplicationById,
} = require("../../js/tempconfigfuncs.js");
const { resolveImage } = require("../../js/imageUtils.js");
const {
  promoteCustomizationImage,
  purgeOldImages,
  isR2ImageResource,
} = require("../../js/customizationImages.js");

module.exports = async ({ interaction, client, context }) => {
  const tempApplicationId = context[0] === "firsttime" ? parseInt(context[1], 10) : parseInt(context[0], 10);

  const { tempApp, error: tempAppError } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (tempAppError || !tempApp) {
    return interaction.reply({
      content: "Temp setup not found. This can happen if you already had a different setup in progress and finished that. Please click cancel and use `/setup` again.",
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if editing an existing application or creating a new one
  let existingApp = null;
  const isEditMode = !!tempApp.applicationId;
  
  if (isEditMode) {
    const { application, error } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
    if (error) {
      return interaction.reply({
        content: `Error: ${error}`,
        flags: MessageFlags.Ephemeral,
      });
    }
    existingApp = application;
  }

  const questions = tempApp.questions
  const reviewChannel = tempApp.reviewchannel
  const verifyChannel = tempApp.verifychannel
  const verifiedRole = tempApp.verifiedrole

  if (!(verifyChannel?.length > 0 && reviewChannel?.length > 0 && verifiedRole?.length > 0 && questions?.length > 0)) {
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

  await finalizeCustomizationImage(
    tempApp,
    "verifychannelembed",
    "images/verifychannelembed",
    interaction.guild.id,
  );
  await finalizeCustomizationImage(
    tempApp,
    "startmessage",
    "images/startmessage",
    interaction.guild.id,
  );
  await finalizeCustomizationImage(
    tempApp,
    "finishmessage",
    "images/finishmessage",
    interaction.guild.id,
  );
  await finalizeCustomizationImage(
    tempApp,
    "verifymessage",
    "images/verifymessage",
    interaction.guild.id,
  );
  await finalizeCustomizationImage(
    tempApp,
    "verificationwelcomemessage",
    "images/verificationwelcomemessage",
    interaction.guild.id,
  );

  cleanConfig(verifychannelembed);
  cleanConfig(startmessage);
  cleanConfig(finishmessage);
  cleanConfig(verifymessage);
  cleanConfig(verificationwelcomemessage);

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

    if (isR2ImageResource(tempApp[category]?.image)) {
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

  const appData = { server_id: interaction.guild.id, name: tempApp.name };
  const fields = [
    'questions', 'reviewchannel', 'verifylogs', 'verifychannel', 'verifiedrole',
    'verifychannelembed', 'startmessage', 'finishmessage', 'verifymessage',
    'verificationwelcomemessage', 'questionpingrole', 'unverifiedrole', 'pingrole',
    'managerrole', 'verificationwelcomechannel', 'usethreads'
  ];

  for (const field of fields) {
    const value = tempApp[field];
    // Skip null/undefined values
    if (value == null) continue;
    
    // Include empty arrays (to allow clearing roles)
    if (Array.isArray(value)) {
      appData[field] = value;
    }
    // Skip empty objects, include non-empty objects
    else if (typeof value === 'object') {
      if (Object.keys(value).length > 0) {
        appData[field] = value;
      }
    }
    // Include all other non-null/non-empty values
    else if (value !== '') {
      appData[field] = value;
    }
  }

  // Create new or update existing application
  let finalApp;
  if (isEditMode) {
    // Update
    Object.assign(existingApp, appData);
    await existingApp.save();
    finalApp = existingApp;
  } else {
    const existingByName = await Application.findOne({
      where: { server_id: interaction.guild.id, name: tempApp.name }
    });
    
    if (existingByName) {
      // Application already exists, update it. (Shouldn't happen, but I've got reports of errors here, probably Discord doing weird and button sends twice).
      Object.assign(existingByName, appData);
      await existingByName.save();
      finalApp = existingByName;
    } else {
      // Create new application
      finalApp = await Application.create(appData);
    }
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

  const embedColor = (tempApp.verifychannelembed?.color ?? existingApp?.verifychannelembed?.color) || "#3f7ff1";
  const embedTitle = tempApp.verifychannelembed?.title ?? existingApp?.verifychannelembed?.title ?? "Verification";
  const embedDescription = tempApp.verifychannelembed?.description ?? existingApp?.verifychannelembed?.description ?? "Please verify yourself by clicking the button below.";
  const embedImage = tempApp.verifychannelembed?.image ?? existingApp?.verifychannelembed?.image;
  const embedImageAsset = resolveImage(embedImage, "verifychannelimage");

  if (!verificationMessage) {
    const verificationembed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setImage(embedImageAsset.embedUrl)
      .setFooter({ text: `${tempApp.name}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verifybutton_${finalApp.id}`)
        .setLabel("Apply")
        .setStyle("Success"),
    );

    let attachment;
    if (embedImageAsset.filePath) {
      attachment = new AttachmentBuilder(embedImageAsset.filePath).setName(
        embedImageAsset.attachmentName,
      );
    }

    await verifyChannelObj.send({
      embeds: [verificationembed],
      components: [row],
      files: attachment ? [attachment] : [],
    });
  } else {
    const verifymessageEmbed = new EmbedBuilder(verificationMessage.embeds[0])
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setImage(embedImageAsset.embedUrl)
      .setFooter({ text: `${tempApp.name}` });

    let attachment;
    if (embedImageAsset.filePath) {
      attachment = new AttachmentBuilder(embedImageAsset.filePath).setName(
        embedImageAsset.attachmentName,
      );
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

  await deleteTempApplication(interaction.guild.id, { id: tempApplicationId });

  const finishembed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Setup finished");

  if (interaction.customId.includes("firsttime")) {
    finishembed.setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe application "${tempApp.name}" is now ready to verify users.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nThis is just the basic setup. You can further customize messages, roles and channels by running the \`/setup edit ${tempApp.name}\` command again.`,
    );
  } else {
    finishembed.setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nThe application "${tempApp.name}" has been updated.\nUsers can start their verification in <#${verifyChannelObj.id}> and applications will then be sent to <#${reviewChannel}>.\n\nYou can redo or adjust this setup any time by running the \`/setup edit ${tempApp.name}\` command again.`,
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

async function finalizeCustomizationImage(tempApp, sectionKey, imageDir, guildId) {
  const section = tempApp[sectionKey];
  if (!section || !section.image) {
    return;
  }

  if (section.image === "deleted") {
    section.image = null;
    //delete from R2
    console.log(`Purging images for deleted image in section ${sectionKey} of app ${tempApp.name} on server ${guildId}`);
    await purgeOldImages({
      serverId: guildId,
      appName: tempApp.name,
      section: sectionKey,
    });
    return;
  }

  if (isR2ImageResource(section.image)) {
    section.image = await finalizeRemoteImage(section.image);
    return;
  }
}

async function finalizeRemoteImage(image) {
  let finalizedImage = image;
  if (image.isTemp) {
    finalizedImage = await promoteCustomizationImage(image);
  }

  await purgeOldImages({
    serverId: finalizedImage.serverId,
    appName: finalizedImage.appName,
    section: finalizedImage.section,
    keepKey: finalizedImage.key,
    filter: "final",
  });

  return finalizedImage;
}
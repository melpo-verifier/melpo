const {
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { Application } = require("../../dbObjects.js");
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
const { updateVerifyMessage, isValidHexColor } = require("../../js/verifyChannelUtils.js");

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

  if (questions.length === 0) {
    return interaction.reply({
      content: "You need to add at least one question.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const verifyChannelObj = interaction.guild.channels.cache.get(verifyChannel);
  if (!verifyChannelObj) {
    return interaction.reply({
      content: "The user verification channel has been deleted. Please set up the user verification channel again.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferUpdate();

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
  }

  const appData = { server_id: interaction.guild.id, name: tempApp.name };
  const fields = [
    'questions', 'reviewchannel', 'verifylogs', 'verifychannel', 'verifiedrole',
    'verifychannelembed', 'startmessage', 'finishmessage', 'verifymessage',
    'verificationwelcomemessage', 'questionpingrole', 'unverifiedrole', 'pingrole',
    'managerrole', 'verificationwelcomechannel', 'usethreads', 'verifymessage_id'
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
    // Check if application exists (in case of error)
    const appExists = await Application.findOne({
      where: { server_id: interaction.guild.id, name: tempApp.name },
    });
    if (appExists) {
      Object.assign(appExists, appData);
      await appExists.save();
      finalApp = appExists;
    } else {
      finalApp = await Application.create(appData);
    }
  }

  const embedColor = isValidHexColor(finalApp?.verifychannelembed?.color) ? finalApp.verifychannelembed.color : (tempApp?.verifychannelembed?.color ?? "#3f7ff1");
  const embedTitle = finalApp?.verifychannelembed?.title ?? tempApp?.verifychannelembed?.title ?? null;
  const embedDescription = finalApp?.verifychannelembed?.description ?? tempApp?.verifychannelembed?.description ?? "Please verify yourself by clicking the button below.";
  const embedImage = finalApp?.verifychannelembed?.image ?? tempApp?.verifychannelembed?.image;
  const embedImageAsset = resolveImage(embedImage);

  const result = await updateVerifyMessage({
    verifyChannelObj,
    botId: client.user.id,
    embedConfig: {
      color: embedColor,
      title: embedTitle,
      description: embedDescription,
      imageUrl: embedImageAsset.embedUrl,
      footer: tempApp.name,
    },
    messageId: finalApp.verifymessage_id,
    button: {
      customId: `verifybutton_${finalApp.id}`,
      label: "Apply",
    },
    appId: finalApp.id,
  });

  if (result?.messageId && result.messageId !== finalApp.verifymessage_id) {
    finalApp.verifymessage_id = result.messageId;
    await finalApp.save().catch(e => console.error("Error saving verify message ID", e));
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

  await interaction.editReply({
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
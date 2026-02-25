const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { getApplicationById, getTempApplicationById } = require("../js/tempconfigfuncs.js");
const { resolveImage } = require("../js/imageUtils.js");

module.exports = async ({ interaction, customIdValue, tempApplicationId, context }) => {
  let chosenvalue;
  if (customIdValue) {
    chosenvalue = customIdValue;
  } else {
    chosenvalue = interaction.values[0];
  }

  tempApplicationId = tempApplicationId || parseInt(context[0], 10);

  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // If editing an existing application, get the application for default values
  let applicationSetup = null;
  if (tempApp.applicationId) {
    const { application } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
    applicationSetup = application;
  }

  const title =
    tempApp[chosenvalue]?.title === "deleted"
      ? null
      : (
          tempApp[chosenvalue]?.title || applicationSetup?.[chosenvalue]?.title
        )?.replace("${interaction.guild.name}", interaction.guild.name) || null;

  const description =
    tempApp[chosenvalue]?.description === "deleted"
      ? null
      : (
          tempApp[chosenvalue]?.description ||
          applicationSetup?.[chosenvalue]?.description
        )?.replace("${interaction.guild.name}", interaction.guild.name) || null;

  const color =
    tempApp[chosenvalue]?.color === "deleted"
      ? null
      : tempApp[chosenvalue]?.color || applicationSetup?.[chosenvalue]?.color;

  const image =
    tempApp[chosenvalue]?.image === "deleted"
      ? null
      : tempApp[chosenvalue]?.image ||
        applicationSetup?.[chosenvalue]?.image ||
        null;

  const text =
    tempApp[chosenvalue]?.text === "deleted"
      ? null
      : tempApp[chosenvalue]?.text ||
        applicationSetup?.[chosenvalue]?.text ||
        null;

  const setImage = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setText_${chosenvalue}_${tempApplicationId}`)
      .setLabel("Set Text")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`setImage_${chosenvalue}_${tempApplicationId}`)
      .setLabel("Set Image")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`removeImage_${chosenvalue}_${tempApplicationId}`)
      .setLabel("Remove Image")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`resetText_${chosenvalue}_${tempApplicationId}`)
      .setLabel("Reset Text")
      .setStyle(ButtonStyle.Danger),
  );

  const colourmenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`colorMenu_${chosenvalue}_${tempApplicationId}`)
      .setPlaceholder("Select color")
      .setOptions(
        { label: "Custom hex color", value: "custom", emoji: "🎨" },
        { label: "Blue", value: "#3f7ff1", emoji: "🔵" },
        { label: "Red", value: "#f03e3e", emoji: "🔴" },
        { label: "Green", value: "#3ef03e", emoji: "🟢" },
        { label: "Yellow", value: "#f0f03e", emoji: "🟡" },
        { label: "Purple", value: "#9d3ef0", emoji: "🟣" },
        { label: "Orange", value: "#f08b3e", emoji: "🟠" },
        { label: "Black", value: "#000000", emoji: "⚫" },
        { label: "White", value: "#ffffff", emoji: "⚪" },
      ),
  );

  let embed;

  if (!text) {
    embed = new EmbedBuilder()
      .setTitle(title ?? null)
      .setDescription(description)
      .setColor(color || "#3f7ff1");
  }

  let infoembed = null;

  if (chosenvalue === "verificationwelcomemessage") {
    if (!text) {
      if (image) {
        embed.setAuthor({
          name: interaction.user.globalName ?? interaction.user.username,
          iconURL: interaction.user.displayAvatarURL({
            dynamic: true,
            size: 128,
          }),
        });
      } else {
        embed.setThumbnail(
          interaction.user.displayAvatarURL({ dynamic: true, size: 512 }),
        );
      }
    }

    infoembed = new EmbedBuilder()
      .setTitle("Verification Welcome Message")
      .setDescription(
        `*This message gets sent to a specific channel in the server upon a user getting verified (channel can be changed in the channels tab)*\n**Placeholder options:**\n-# **{usermention}** - mention the user\n-# **{username}** - username\n-# **{modname}** - moderator name (which verified the user)\n-# **{members}** - server member count\n-# **{verifiedmembers}** - server verified member count\n-# **{qn}** - with \`n\` being the number of the question you want the users response.`,
      );
  } else if (chosenvalue === "startmessage") {
    infoembed = new EmbedBuilder()
      .setTitle("Verification Start Message")
      .setDescription(
        `*This message gets sent to a user upon starting the application*\n**Placeholder options:**\n-# **{username}** - username`,
      );
  } else if (chosenvalue === "finishmessage") {
    infoembed = new EmbedBuilder()
      .setTitle("Verification Finish Message")
      .setDescription(
        `*This message gets sent to a user upon finishing the application*\n**Placeholder options:**\n-# **{username}** - username`,
      );
  } else if (chosenvalue === "verifymessage") {
    infoembed = new EmbedBuilder()
      .setTitle("Verification Message")
      .setDescription(
        `*This message gets sent to a user upon getting verified*\n**Placeholder options:**\n-# **{username}** - username\n-# **{modname}** - moderator name (which verified the user)\n-# **{members}** - server member count\n-# **{verifiedmembers}** - server verified member count`,
      );
  } else if (chosenvalue === "verifychannelembed") {
    infoembed = new EmbedBuilder()
      .setTitle("Verification Channel Embed")
      .setDescription(
        `*This embed gets sent to the user verification channel where users can click to start the verification process*`,
      );
  }

  if (infoembed) {
    infoembed.setColor("#3f7ff1");
  }

  if (image && embed) {
    const asset = resolveImage(image);
    if (asset.embedUrl) {
      embed.setColor(color || "#3f7ff1").setImage(asset.embedUrl);
    }
  }

  if (embed !== undefined) {
    embed.setFooter({ text: `This is the ${chosenvalue}.` });
  }

  // Rebuild the customization select menu with the correct default
  const selectcustomizationMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("selectcustomizationMenu_" + tempApplicationId)
      .setPlaceholder("Select what message you want to customize")
      .addOptions(
        {
          label: "Verify channel Embed",
          description: `Message to which users click "verify" to start verification`,
          value: "verifychannelembed",
          default: chosenvalue === "verifychannelembed",
        },
        {
          label: "Verification start message",
          description: `Message user gets when starting verification`,
          value: "startmessage",
          default: chosenvalue === "startmessage",
        },
        {
          label: "Verification finish message",
          description: "Message user gets when finishing verification",
          value: "finishmessage",
          default: chosenvalue === "finishmessage",
        },
        {
          label: "On verify message",
          description: "Message user gets when getting verified",
          value: "verifymessage",
          default: chosenvalue === "verifymessage",
        },
        {
          label: "Verification welcome message",
          description: "Welcome message in the server when user gets verified",
          value: "verificationwelcomemessage",
          default: chosenvalue === "verificationwelcomemessage",
        },
      ),
  );

  // Get the finish buttons from the last component
  const finishbuttons = interaction.message.components[interaction.message.components.length - 1];

  if (interaction.replied || interaction.deferred) {
    if (
      chosenvalue === "verificationwelcomemessage" ||
      chosenvalue === "verifychannelembed"
    ) {
      interaction.message.edit({
        content: text ? text : null,
        embeds: embed ? [infoembed, embed] : [infoembed],
        components: [
          interaction.message.components[0],
          selectcustomizationMenu,
          colourmenu,
          setImage,
          finishbuttons,
        ],
      });
    } else {
      interaction.message.edit({
        content: text ? text : null,
        embeds: infoembed ? [infoembed, embed] : [embed],
        components: [
          interaction.message.components[0],
          selectcustomizationMenu,
          setImage,
          finishbuttons,
        ],
      });
    }
  } else {
    if (
      chosenvalue === "verificationwelcomemessage" ||
      chosenvalue === "verifychannelembed"
    ) {
      interaction.update({
        content: text ? text : null,
        embeds: embed ? [infoembed, embed] : [infoembed],
        components: [
          interaction.message.components[0],
          selectcustomizationMenu,
          colourmenu,
          setImage,
          finishbuttons,
        ],
      });
    } else {
      interaction.update({
        content: text ? text : null,
        embeds: infoembed ? [infoembed, embed] : [embed],
        components: [
          interaction.message.components[0],
          selectcustomizationMenu,
          setImage,
          finishbuttons,
        ],
      });
    }
  }
};

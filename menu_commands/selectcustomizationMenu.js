const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { createTemporarySetup } = require("../js/tempconfigfuncs.js");
const { ServerConfig } = require("../dbObjects.js");
const fs = require("fs");
const path = require("path");

module.exports = async ({ interaction, customIdValue }) => {
  var chosenvalue;
  if (customIdValue) {
    chosenvalue = customIdValue;
  } else {
    chosenvalue = interaction.values[0];
  }

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });
  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  const title =
    temporarySetup[chosenvalue]?.title === "deleted"
      ? null
      : (
          temporarySetup[chosenvalue]?.title || serverConfig[chosenvalue]?.title
        )?.replace("${interaction.guild.name}", interaction.guild.name) || null;

  const description =
    temporarySetup[chosenvalue]?.description === "deleted"
      ? null
      : (
          temporarySetup[chosenvalue]?.description ||
          serverConfig[chosenvalue]?.description
        )?.replace("${interaction.guild.name}", interaction.guild.name) || null;

  const color =
    temporarySetup[chosenvalue]?.color === "deleted"
      ? null
      : temporarySetup[chosenvalue]?.color || serverConfig[chosenvalue]?.color;

  const image =
    temporarySetup[chosenvalue]?.image === "deleted"
      ? null
      : temporarySetup[chosenvalue]?.image ||
        serverConfig[chosenvalue]?.image ||
        null;

  const text =
    temporarySetup[chosenvalue]?.text === "deleted"
      ? null
      : temporarySetup[chosenvalue]?.text ||
        serverConfig[chosenvalue]?.text ||
        null;

  const setImage = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`setText_${chosenvalue}`)
      .setLabel("Set Text")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`setImage_${chosenvalue}`)
      .setLabel("Set Image")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`removeImage_${chosenvalue}`)
      .setLabel("Remove Image")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`resetText_${chosenvalue}`)
      .setLabel("Reset Text")
      .setStyle(ButtonStyle.Danger),
  );

  const colourmenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`colorMenu_${chosenvalue}`)
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

  var embed;

  if (!text) {
    embed = new EmbedBuilder()
      .setTitle(title ?? null)
      .setDescription(description)
      .setColor(color || "#3f7ff1");
  }

  var infoembed = null;

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

  var attachment;

  if (image) {
    const filePath = path.join(
      __dirname,
      "..",
      "images",
      chosenvalue,
      path.basename(image),
    );

    if (fs.existsSync(filePath)) {
      try {
        attachment = new AttachmentBuilder(filePath).setName(
          `${chosenvalue}.${image.split(".").pop()}`,
        );
        embed
          .setColor(color || "#3f7ff1")
          .setImage(`attachment://${chosenvalue}.${image.split(".").pop()}`);
      } catch (error) {
        console.error("Error creating attachment:", error);
      }
    } else {
      console.error(`File not found: ${filePath}`);
    }
  }

  if (embed !== undefined) {
    embed.setFooter({ text: `This is the ${chosenvalue}.` });
  }

  var messagecomponent1 = interaction.message.components[1];

  //customize interaction.message.components[1] to make chosenvalue the default option selected IF there is a chosenvalue
  if (chosenvalue) {
    messagecomponent1.components.forEach((component) => {
      if (component.customId === "selectcustomizationMenu") {
        component.options.forEach((option) => {
          if (option.value === chosenvalue) {
            option.default = true;
          } else {
            option.default = false;
          }
        });
      }
    });
  }

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
          messagecomponent1,
          colourmenu,
          setImage,
          interaction.message.components.pop(),
        ],
        files: attachment ? [attachment] : [],
      });
    } else {
      interaction.message.edit({
        content: text ? text : null,
        embeds: infoembed ? [infoembed, embed] : [embed],
        components: [
          interaction.message.components[0],
          messagecomponent1,
          setImage,
          interaction.message.components.pop(),
        ],
        files: attachment ? [attachment] : [],
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
          messagecomponent1,
          colourmenu,
          setImage,
          interaction.message.components.pop(),
        ],
        files: attachment ? [attachment] : [],
      });
    } else {
      interaction.update({
        content: text ? text : null,
        embeds: infoembed ? [infoembed, embed] : [embed],
        components: [
          interaction.message.components[0],
          messagecomponent1,
          setImage,
          interaction.message.components.pop(),
        ],
        files: attachment ? [attachment] : [],
      });
    }
  }
};

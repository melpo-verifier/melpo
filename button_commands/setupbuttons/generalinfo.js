const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const {
  createTemporarySetup,
  deleteTemporarySetup,
} = require("../../js/tempconfigfuncs.js");
const { ServerConfig } = require("../../dbObjects.js");

module.exports = async ({ interaction, context, whichdefault }) => {
  const { catagorybuttons } = require("../../js/constants.js");
  catagorybuttons.components.forEach((button) => button.setDisabled(false));
  catagorybuttons.components[0].setDisabled(true);

  if (context && context[0] === "true") {
    await deleteTemporarySetup(interaction.guild.id);
  }

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

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

  const generalembed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Channels setup")
    .setDescription(
      `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n_ _`,
    )
    .addFields(
      {
        name: "Verification Start Channel `required`",
        value: verifyChannel
          ? `<#${verifyChannel.toString()}>`
          : `**Not set up**`,
        inline: false,
      },
      {
        name: "Verification Review Channel `required`",
        value: reviewChannel
          ? `<#${reviewChannel.toString()}>`
          : `**Not set up**`,
        inline: false,
      },
      {
        name: "Verification Logs Channel `optional`",
        value: verifyLogsChannel
          ? `<#${verifyLogsChannel.toString()}>`
          : `**Not set up**`,
        inline: false,
      },
      {
        name: "Verification welcome message `optional`",
        value: `${verificationwelcomechannel ? `<#${verificationwelcomechannel.toString()}>` : "**Not set up**"}\n*To customize welcome message, go to "customization" button*`,
        inline: false,
      },
    );

  const finishbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("finishsetup")
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup")
      .setLabel("Cancel")
      .setStyle("Danger"),
  );

  const selectChannelMenu = new StringSelectMenuBuilder()
    .setCustomId("selectChannelMenu")
    .setPlaceholder("Select which channel you want to setup")
    .addOptions(
      {
        label: "Verification Start Channel",
        description: "Channel in which users start their verification process",
        value: "verifyChannel",
        default: whichdefault === 0 ? true : false,
      },
      {
        label: "Verification Review Channel",
        description: "Channel in which staff reviews verification applications",
        value: "reviewChannel",
        default: whichdefault === 1 ? true : false,
      },
      {
        label: "Verification Logs Channel",
        description: "Channel in which handled applications are logged",
        value: "verifyLogsChannel",
        default: whichdefault === 2 ? true : false,
      },
      {
        label: "Verification Welcome Channel",
        description: "Channel in which the welcome message will be sent",
        value: "verificationWelcomeChannel",
        default: whichdefault === 3 ? true : false,
      },
    );

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId(`channelMenu_${whichdefault}`)
    .setChannelTypes("GuildText")
    .setPlaceholder("Select channel")
    .setMinValues(0)
    .setMaxValues(1)
    .setDefaultChannels(
      whichdefault === 0
        ? verifyChannel
          ? [verifyChannel]
          : []
        : whichdefault === 1
          ? reviewChannel
            ? [reviewChannel]
            : []
          : whichdefault === 2
            ? verifyLogsChannel
              ? [verifyLogsChannel]
              : []
            : whichdefault === 3
              ? verificationwelcomechannel
                ? [verificationwelcomechannel]
                : []
              : [],
    );

  const menus = [
    new ActionRowBuilder().setComponents(selectChannelMenu),
    new ActionRowBuilder().setComponents(channelMenu),
  ];

  if (interaction.isCommand()) {
    await interaction.reply({
      content: "",
      embeds: [generalembed],
      components: [catagorybuttons, ...menus, finishbuttons],
      files: [],
    });
  } else {
    await interaction.update({
      content: "",
      embeds: [generalembed],
      components: [catagorybuttons, ...menus, finishbuttons],
      files: [],
    });
  }
};

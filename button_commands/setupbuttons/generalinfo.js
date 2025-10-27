const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { createTempApplication, deleteTempApplication } = require("../../js/tempconfigfuncs.js");
const { Application } = require("../../dbObjects.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, whichdefault, appName }) => {
  // Try to get appName from appName, context[1], or context[0]
  appName = appName ?? context?.[1] ?? context?.[0];
  if (!appName) {
    return interaction.reply({
      content: 'Application name is missing. Please try again.',
      ephemeral: true,
    });
  }

  if (context && context[0] === "true") {
    await deleteTempApplication(interaction.guild.id, { name: appName });
  }

  const applicationSetup = await Application.findOne({ where: { name: appName } });

  const { tempApp } = await createTempApplication(interaction.guild.id, { name: appName });

  const reviewChannel =
    tempApp.reviewchannel === "deleted"
      ? null
      : tempApp.reviewchannel || applicationSetup.reviewchannel;
  const verifyLogsChannel =
    tempApp.verifylogs === "deleted"
      ? null
      : tempApp.verifylogs || applicationSetup.verifylogs;
  const verifyChannel =
    tempApp.verifychannel === "deleted"
      ? null
      : tempApp.verifychannel || applicationSetup.verifychannel;
  const verificationwelcomechannel =
    tempApp.verificationwelcomechannel === "deleted"
      ? null
      : tempApp.verificationwelcomechannel ||
        applicationSetup.verificationwelcomechannel;


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
      .setCustomId("finishsetup_" + appName)
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup_" + appName)
      .setLabel("Cancel")
      .setStyle("Danger"),
    new ButtonBuilder()
      .setLabel("Configure on dashboard")
      .setStyle("Link")
      .setURL(
        `https://melpo.app/dashboard/${interaction.guild.id}`,
      ),
  );

  const selectChannelMenu = new StringSelectMenuBuilder()
    .setCustomId("selectChannelMenu_" + appName)
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
    .setCustomId(`channelMenu_${whichdefault}_${appName}`)
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

  const categoryButtons = createCategoryButtons(appName, 0); // 0 = Channels is disabled

  if (interaction.isCommand()) {
    await interaction.reply({
      content: "",
      embeds: [generalembed],
      components: [categoryButtons, ...menus, finishbuttons],
      files: [],
    });
  } else {
    await interaction.update({
      content: "",
      embeds: [generalembed],
      components: [categoryButtons, ...menus, finishbuttons],
      files: [],
    });
  }
};

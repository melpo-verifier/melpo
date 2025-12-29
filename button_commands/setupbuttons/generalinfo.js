const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { createTempApplication, deleteTempApplication, getApplicationById, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, whichdefault, applicationId, tempApplicationId }) => {
  tempApplicationId = tempApplicationId ?? applicationId ?? (context?.[0] ? parseInt(context[0], 10) : null);
  
  if (!tempApplicationId) {
    return interaction.reply({
      content: 'Temp Application ID is missing. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { tempApp, error } = await getTempApplicationById(parseInt(tempApplicationId), interaction.guild.id);
  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Context[1] means to create a new temp application and delete the old one
  if (context && context[1] === "true") {
    await deleteTempApplication(interaction.guild.id, { id: parseInt(tempApplicationId) });
    const { tempApp: newTempApp } = await createTempApplication(interaction.guild.id, { 
      applicationId: tempApp.applicationId,
      name: tempApp.name 
    });
    tempApplicationId = newTempApp.id;
  }

  const { tempApp: finalTempApp } = tempApplicationId !== tempApp?.id 
    ? await getTempApplicationById(parseInt(tempApplicationId), interaction.guild.id)
    : { tempApp };

  // If editing an existing application, get the application for default values
  let applicationSetup = null;
  if (finalTempApp.applicationId) {
    const { application } = await getApplicationById(finalTempApp.applicationId, interaction.guild.id);
    applicationSetup = application;
  }

  const reviewChannel =
    finalTempApp.reviewchannel === "deleted"
      ? null
      : finalTempApp.reviewchannel || applicationSetup?.reviewchannel;
  const verifyLogsChannel =
    finalTempApp.verifylogs === "deleted"
      ? null
      : finalTempApp.verifylogs || applicationSetup?.verifylogs;
  const verifyChannel =
    finalTempApp.verifychannel === "deleted"
      ? null
      : finalTempApp.verifychannel || applicationSetup?.verifychannel;
  const verificationwelcomechannel =
    finalTempApp.verificationwelcomechannel === "deleted"
      ? null
      : finalTempApp.verificationwelcomechannel ||
        applicationSetup?.verificationwelcomechannel;


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
      .setCustomId("finishsetup_" + tempApplicationId)
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup_" + tempApplicationId)
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
    .setCustomId("selectChannelMenu_" + tempApplicationId)
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
    .setCustomId(`channelMenu_${whichdefault}_${tempApplicationId}`)
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

  const categoryButtons = createCategoryButtons(tempApplicationId, 0); // 0 = Channels is disabled

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

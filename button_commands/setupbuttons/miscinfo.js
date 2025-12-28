const { ButtonBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { Application } = require("../../dbObjects.js");
const { createTempApplication } = require("../../js/tempconfigfuncs.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, appName }) => {
  // Try to get appName from context[0], fallback to context[1]
  appName = appName ?? context?.[1] ?? context?.[0];
  if (!appName) {
    return interaction.reply({
      content: 'Application name is missing. Please try again.',
      ephemeral: true,
    });
  }

  const applicationSetup = await Application.findOne({
    where: { name: appName },
  });

  const { tempApp } = await createTempApplication(interaction.guild.id, { name: appName });

  // Display threads state: prefer explicit temp setting, otherwise fall back to existing app, then false
  const useThreads = (tempApp.usethreads !== null && tempApp.usethreads !== undefined)
    ? tempApp.usethreads
    : (applicationSetup?.usethreads ?? false);

  const miscEmbed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Miscellaneous setup")
    .setDescription(
      "[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nMiscellaneous options that can be set up:",
    )
    .addFields(
      {
        name: "Use Threads",
        value: `**${useThreads ? "Enabled" : "Disabled"}**\n*When enabled, a thread will be attached to verification applications for a more organised review and logs channel. Any answers to questions will be sent in the thread. **Recommended if you have a log channel setup and/or receive many applications.***`,
        inline: false,
      },
      // { name: 'Verify Filter', value: 'This is a filter that will be applied to the bot. If the bot detects a message that contains any of the words in the filter during verification, it will automatically deny that user.', inline: false },
      // { name: 'Action button', value: 'Change what the "Kick" button does. By default, it kicks the user. You can change it to ban the user instead.', inline: false },
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

  const miscButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`toggleusethreads_${useThreads}_${appName}`)
      .setLabel(`${useThreads ? "Disable" : "Enable"} Threads`)
      .setStyle(useThreads ? "Danger" : "Success"),
    // new ButtonBuilder()
    //     .setCustomId('setverifyfilter')
    //     .setLabel('Verify Filter')
    //     .setStyle('Primary'),
    // new ButtonBuilder()
    //     .setCustomId('setactionbutton')
    //     .setLabel('Action Button')
    //     .setStyle('Primary'),
  );

  const categoryButtons = createCategoryButtons(appName, 4); // 4 = Misc is disabled

  if (interaction.replied || interaction.deferred) {
    await interaction.message.edit({
      content: "",
      embeds: [miscEmbed],
      components: [categoryButtons, miscButtons, finishbuttons],
    });
  } else {
    await interaction.update({
      content: "",
      embeds: [miscEmbed],
      components: [categoryButtons, miscButtons, finishbuttons],
    });
  }
};

const { ButtonBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { ServerConfig } = require("../../dbObjects.js");
const { createTemporarySetup } = require("../../js/tempconfigfuncs.js");

module.exports = async ({ interaction }) => {
  const { catagorybuttons } = require("../../js/constants.js");
  catagorybuttons.components.forEach((button) => button.setDisabled(false));
  catagorybuttons.components[4].setDisabled(true);

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  const useThreads =
    temporarySetup.usethreads !== null
      ? temporarySetup.usethreads
      : serverConfig?.usethreads || false;

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
      .setCustomId("finishsetup")
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup")
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
      .setCustomId(`toggleusethreads_${useThreads}`)
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

  if (interaction.replied || interaction.deferred) {
    await interaction.message.edit({
      content: "",
      embeds: [miscEmbed],
      components: [catagorybuttons, miscButtons, finishbuttons],
    });
  } else {
    await interaction.update({
      content: "",
      embeds: [miscEmbed],
      components: [catagorybuttons, miscButtons, finishbuttons],
    });
  }
};

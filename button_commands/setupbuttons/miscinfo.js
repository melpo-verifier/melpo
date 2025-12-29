const { ButtonBuilder, ActionRowBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const { getApplicationById, getTempApplicationById } = require("../../js/tempconfigfuncs.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context, applicationId, tempApplicationId }) => {
  tempApplicationId = tempApplicationId ?? applicationId ?? (context?.[1] ? parseInt(context[1], 10) : null) ?? (context?.[0] ? parseInt(context[0], 10) : null);
  if (!tempApplicationId) {
    return interaction.reply({
      content: 'Temp Application ID is missing. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const { tempApp, error } = await getTempApplicationById(tempApplicationId, interaction.guild.id);
  if (error) {
    return interaction.reply({
      content: `Error: ${error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  let applicationSetup = null;
  if (tempApp.applicationId) {
    const { application } = await getApplicationById(tempApp.applicationId, interaction.guild.id);
    applicationSetup = application;
  }

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

  const miscButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`toggleusethreads_${useThreads}_${tempApplicationId}`)
      .setLabel(`${useThreads ? "Disable" : "Enable"} Threads`)
      .setStyle(useThreads ? "Danger" : "Success"),
  );

  const categoryButtons = createCategoryButtons(tempApplicationId, 4); // 4 = Misc is disabled

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

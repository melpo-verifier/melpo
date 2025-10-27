const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { createCategoryButtons } = require("../../js/constants.js");

module.exports = async ({ interaction, context }) => {
  const appName = context?.[0] ?? context?.[1];

  const customizationEmbed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Customization setup")
    .setDescription(
      '[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nYou can customize all messages that the bot sends. Please note that the verification welcome message only has effect when a verification welcome channel is set up in the "Channels" section.\nThe following messages can be customized:\n- Verify channel Embed\n- Verification start message\n- Verification finish message\n- On verify message\n- Verification welcome message',
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

  const selectcustomizationMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("selectcustomizationMenu_" + appName)
      .setPlaceholder("Select what message you want to customize")
      .addOptions(
        {
          label: "Verify channel Embed",
          description: `Message to which users click "verify" to start verification`,
          value: "verifychannelembed",
        },
        {
          label: "Verification start message",
          description: `Message user gets when starting verification`,
          value: "startmessage",
        },
        {
          label: "Verification finish message",
          description: "Message user gets when finishing verification",
          value: "finishmessage",
        },
        {
          label: "On verify message",
          description: "Message user gets when getting verified",
          value: "verifymessage",
        },
        {
          label: "Verification welcome message",
          description: "Welcome message in the server when user gets verified",
          value: "verificationwelcomemessage",
        },
      ),
  );

  const categoryButtons = createCategoryButtons(appName, 3); // 3 = Customization is disabled

  if (interaction.replied || interaction.deferred) {
    await interaction.message.edit({
      content: "",
      embeds: [customizationEmbed],
      components: [categoryButtons, selectcustomizationMenu, finishbuttons],
    });
  } else {
    await interaction.update({
      content: "",
      embeds: [customizationEmbed],
      components: [categoryButtons, selectcustomizationMenu, finishbuttons],
    });
  }
};

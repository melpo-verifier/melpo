const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");
const { createTemporarySetup } = require("../../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  const nextnumber = parseInt(context[0]);

  const originalComponents = interaction.message.components;
  const actionRow = originalComponents[1];
  const originalButtons = actionRow.components;

  const nextButton = ButtonBuilder.from(originalButtons[0]);
  nextButton.setDisabled(true);

  const updatedActionRow = new ActionRowBuilder().addComponents(
    nextButton,
    originalButtons[1],
  );

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  if (nextnumber === 0) {
    const verifyChannel = temporarySetup.verifychannel;

    const channelmenu = new ChannelSelectMenuBuilder()
      .setCustomId("firstTimeMenu_1")
      .setChannelTypes("GuildText")
      .setPlaceholder("Channel the applications will be sent to (for mods)")
      .setMinValues(1)
      .setMaxValues(1);

    const selectmenu = new ActionRowBuilder().setComponents(channelmenu);

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setDescription(
        `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nGreat! You've set up your user verification channel! Now let's set up the channel where the applications will be sent. This channel will be used to send the applications to the mods for review. Please select the channel where the applications will be sent  and then click the "Next" button below to continue...`,
      )
      .setFields([
        {
          name: "User Verification Channel `(required)`",
          value: `<#${verifyChannel}>`,
          inline: false,
        },
        {
          name: "Verification Review Channel `(required)`",
          value: `No channel set up yet`,
          inline: false,
        },
      ]);

    await interaction.update({ components: [] });
    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: [selectmenu, updatedActionRow],
    });
  } else if (nextnumber === 1) {
    const reviewChannel = temporarySetup.reviewchannel;
    const verifyChannel = temporarySetup.verifychannel;

    const channelmenu = new RoleSelectMenuBuilder()
      .setCustomId("firstTimeMenu_2")
      .setPlaceholder("Role(s) to be given to verified users")
      .setMinValues(1)
      .setMaxValues(15);

    const selectmenu = new ActionRowBuilder().setComponents(channelmenu);

    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setDescription(
        `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nAwesome! We've now set up all required channels! Now we just need to add a verified role and a few questions! We'll start with the verified role, this role will be given to users once they've been verified. Please select the role(s) that you would like to be given to users once they've been verified and then click the "Next" button below to continue...\n\n**Note:** If you set up multiple roles, the bot will give all of them to the user.`,
      )
      .setFields([
        {
          name: "User Verification Channel `(required)`",
          value: `<#${verifyChannel}>`,
          inline: false,
        },
        {
          name: "Verification Review Channel `(required)`",
          value: `<#${reviewChannel}>`,
          inline: false,
        },
        {
          name: "Verified Role `(required)`",
          value: `No role set up yet`,
          inline: false,
        },
      ]);

    await interaction.update({ components: [] });
    await interaction.message.edit({
      embeds: [updatedEmbed],
      components: [selectmenu, updatedActionRow],
    });
  } else if (nextnumber === 2) {
    const firsttimequestions = require("../../js/firsttimequestions.js");

    firsttimequestions({ interaction });
  }
};

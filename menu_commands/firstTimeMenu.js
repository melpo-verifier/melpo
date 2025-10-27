const { ButtonBuilder, ActionRowBuilder } = require("discord.js");
const { updateTemporarySetup, updateTempApplication } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  await interaction.deferUpdate();
  const channelnumber = parseInt(context[0]);
  const appName = context[1]
  console.log(context)

  if (channelnumber === 0) {
    const channel = interaction.values[0];

    // await updateTemporarySetup(interaction.guild.id, {
    //   verifychannel: channel,
    // });
    await updateTempApplication(interaction.guild.id, {
      verifychannel: channel,
    }, { name: appName });

    const embed = interaction.message.embeds[0];
    embed.fields[channelnumber].value = `<#${channel}>`;

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false);

    const updatedActionRow = new ActionRowBuilder().addComponents(
      nextButton,
      originalButtons[1],
    );

    await interaction.editReply({
      embeds: [embed],
      components: [interaction.message.components[0], updatedActionRow],
    });
  } else if (channelnumber === 1) {
    const channel = interaction.values[0];

    // await updateTemporarySetup(interaction.guild.id, {
    //   reviewchannel: channel,
    // });
    await updateTempApplication(interaction.guild.id, {
      reviewchannel: channel,
    }, { name: appName });


    //edit embed to show the channel and enable the next button from the interaction components
    const embed = interaction.message.embeds[0];
    embed.fields[channelnumber].value = `<#${channel}>`;

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false).setCustomId(`next_1_${appName}`);

    const updatedActionRow = new ActionRowBuilder().addComponents(
      nextButton,
      originalButtons[1],
    );

    await interaction.editReply({
      embeds: [embed],
      components: [interaction.message.components[0], updatedActionRow],
    });
  } else if (channelnumber === 2) {
    const role = interaction.values;

    // await updateTemporarySetup(interaction.guild.id, { verifiedrole: role });

    await updateTempApplication(interaction.guild.id, {
      verifiedrole: role,
    }, { name: appName });

    const embed = interaction.message.embeds[0];
    embed.fields[channelnumber].value = role
      ?.map((role) => `<@&${role}>`)
      .join(", ");

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false).setCustomId(`next_2_${appName}`);

    const updatedActionRow = new ActionRowBuilder().addComponents(
      nextButton,
      originalButtons[1],
    );

    await interaction.editReply({
      embeds: [embed],
      components: [interaction.message.components[0], updatedActionRow],
    });
  }
};

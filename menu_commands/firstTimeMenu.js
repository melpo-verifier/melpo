const { ButtonBuilder, ActionRowBuilder } = require("discord.js");
const { updateTemporarySetup } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  const channelnumber = parseInt(context[0]);

  if (channelnumber === 0) {
    const channel = interaction.values[0];

    await updateTemporarySetup(interaction.guild.id, {
      verifychannel: channel,
    });

    //edit embed to show the channel and enable the next button from the interaction components
    const embed = interaction.message.embeds[0];
    embed.fields[channelnumber].value = `<#${channel}>`;

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    // Find the specific button to modify (assuming it's the first button)
    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false);

    // Update the action row with the modified button
    const updatedActionRow = new ActionRowBuilder().addComponents(
      nextButton,
      originalButtons[1],
    );

    await interaction.update({
      embeds: [embed],
      components: [interaction.message.components[0], updatedActionRow],
    });
  } else if (channelnumber === 1) {
    const channel = interaction.values[0];

    await updateTemporarySetup(interaction.guild.id, {
      reviewchannel: channel,
    });

    //edit embed to show the channel and enable the next button from the interaction components
    const embed = interaction.message.embeds[0];
    embed.fields[channelnumber].value = `<#${channel}>`;

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    // Find the specific button to modify (assuming it's the first button)
    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false).setCustomId("next_1");

    // Update the action row with the modified button
    const updatedActionRow = new ActionRowBuilder().addComponents(
      nextButton,
      originalButtons[1],
    );

    await interaction.update({
      embeds: [embed],
      components: [interaction.message.components[0], updatedActionRow],
    });
  } else if (channelnumber === 2) {
    const role = interaction.values;

    await updateTemporarySetup(interaction.guild.id, { verifiedrole: role });

    //edit embed to show the role and enable the next button from the interaction components
    const embed = interaction.message.embeds[0];
    embed.fields[channelnumber].value = role
      ?.map((role) => `<@&${role}>`)
      .join(", ");

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    // Find the specific button to modify (assuming it's the first button)
    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false).setCustomId("next_2");

    // Update the action row with the modified button
    const updatedActionRow = new ActionRowBuilder().addComponents(
      nextButton,
      originalButtons[1],
    );

    await interaction.update({
      embeds: [embed],
      components: [interaction.message.components[0], updatedActionRow],
    });
  }
};

const { ButtonBuilder, ActionRowBuilder, EmbedBuilder } = require("discord.js");
const { updateTempApplication } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  await interaction.deferUpdate();
  const channelnumber = parseInt(context[0], 10);
  const tempApplicationId = parseInt(context[1], 10);

  if (channelnumber === 0) {
    const channel = interaction.values[0];

    await updateTempApplication(interaction.guild.id, {
      verifychannel: channel,
    }, { id: tempApplicationId });

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.data.fields[channelnumber].value = `<#${channel}>`;

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

    await updateTempApplication(interaction.guild.id, {
      reviewchannel: channel,
    }, { id: tempApplicationId });

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.data.fields[channelnumber].value = `<#${channel}>`;

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false).setCustomId(`next_1_${tempApplicationId}`);

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

    await updateTempApplication(interaction.guild.id, {
      verifiedrole: role,
    }, { id: tempApplicationId });

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.data.fields[channelnumber].value = role
      ?.map((role) => `<@&${role}>`)
      .join(", ");

    const originalComponents = interaction.message.components;
    const actionRow = originalComponents[1];
    const originalButtons = actionRow.components;

    const nextButton = ButtonBuilder.from(originalButtons[0]);
    nextButton.setDisabled(false).setCustomId(`next_2_${tempApplicationId}`);

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

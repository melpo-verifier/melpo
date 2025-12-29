const { updateTempApplication } = require("../js/tempconfigfuncs.js");

const CHANNEL_FIELDS = {
  0: "verifychannel",
  1: "reviewchannel",
  2: "verifylogs",
  3: "verificationwelcomechannel",
};

module.exports = async ({ interaction, context }) => {
  const number = parseInt(context[0], 10);
  const tempApplicationId = parseInt(context[1], 10);
  const embed = interaction.message.embeds[0];
  const values = interaction.values;
  const selectedValue = values[0] ?? "deleted";

  const fieldName = CHANNEL_FIELDS[number];
  if (fieldName) {
    await updateTempApplication(
      interaction.guild.id,
      { [fieldName]: selectedValue },
      { id: tempApplicationId }
    );
    embed.fields[number].value =
      selectedValue !== "deleted" ? `<#${selectedValue}>` : `**Not set up**`;
  }

  await interaction.update({ embeds: [embed] });
};

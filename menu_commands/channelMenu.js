const { updateTempApplication } = require("../js/tempconfigfuncs.js");

module.exports = async ({ interaction, context }) => {
  console.log(context);
  const number = parseInt(context[0]);
  const appName = context[1];
  const embed = interaction.message.embeds[0];
  var ivalues = interaction.values;

  if (ivalues[0] === undefined) {
    ivalues[0] = "deleted";
  }

  console.log(ivalues[0]);

  console.log(number);

  if (number === 0) {
    await updateTempApplication(interaction.guild.id, {
      verifychannel: ivalues[0],
    }, { name: appName });
    embed.fields[number].value =
      ivalues[0] !== "deleted" ? `<#${ivalues[0]}>` : `**Not set up**`;
  } else if (number === 1) {
    console.log(ivalues[0]);
    await updateTempApplication(interaction.guild.id, {
      reviewchannel: ivalues[0],
    }, { name: appName });
    embed.fields[number].value =
      ivalues[0] !== "deleted" ? `<#${ivalues[0]}>` : `**Not set up**`;
  } else if (number === 2) {
    await updateTempApplication(interaction.guild.id, {
      verifylogs: ivalues[0],
    }, { name: appName });
    embed.fields[number].value =
      ivalues[0] !== "deleted" ? `<#${ivalues[0]}>` : `**Not set up**`;
  } else if (number === 3) {
    await updateTempApplication(interaction.guild.id, {
      verificationwelcomechannel: ivalues[0],
    }, { name: appName });
    embed.fields[number].value =
      ivalues[0] !== "deleted" ? `<#${ivalues[0]}>` : `**Not set up**`;
  }

  await interaction.update({ embeds: [embed] });
};

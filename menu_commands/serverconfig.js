const { MessageFlags } = require("discord.js");
const { ServerConfig } = require("../dbObjects.js");
const { ServerConfigComponent } = require("../js/serverConfigUI.js");

module.exports = async ({ interaction, context }) => {
  const action = context?.[0];

  const [serverConfig] = await ServerConfig.findOrCreate({ where: { server_id: interaction.guild.id } });

  if (!serverConfig) {
    return interaction.reply({
      content: "Server configuration not found!",
      flags: MessageFlags.Ephemeral,
    });
  }

  const selectedRoles = interaction.values ?? [];

  switch (action) {
    case "autoRoles":
      await serverConfig.update({ autorole: selectedRoles });
  }

  await serverConfig.reload();
  const component = ServerConfigComponent({serverConfig});

  return interaction.update(component);
};

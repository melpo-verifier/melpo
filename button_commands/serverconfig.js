const { MessageFlags, ContainerBuilder } = require("discord.js");
const { ServerConfig } = require("../dbObjects.js");
const {
  ServerConfigComponent,
} = require("../js/serverConfigUI.js");

module.exports = async ({ interaction, context }) => {
  const action = context?.[0];
  const [serverConfig] = await ServerConfig.findOrCreate({ where: { server_id: interaction.guild.id } });
  
  if (!serverConfig) {
    return interaction.reply({
      content: "Server configuration not found!",
      flags: MessageFlags.Ephemeral,
    });
  }

  const finishedContainer = new ContainerBuilder()
    .setAccentColor(0x00ff00)
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        '✅ Server configuration saved successfully!',
      ),
    )

  switch (action) {
    case "exit":
      return interaction.update({
        components: [finishedContainer],
      });  
  }
      
  await serverConfig.reload();
  const component = ServerConfigComponent({serverConfig});

  return interaction.update(component);
};

const { ButtonStyle, ActionRowBuilder, RoleSelectMenuBuilder, SeparatorSpacingSize, ContainerBuilder, ButtonBuilder } = require("discord.js");

const toArray = (value) => {
  if (!value) { return []; }
  return Array.isArray(value) ? value : [value];
};

const formatRoles = (roles) => { return roles.map((roleId) => `<@&${roleId}>`).join(", "); };

const ServerConfigComponent = ({ serverConfig }) => {
  const autoRoles = toArray(serverConfig?.autorole);

  const container = new ContainerBuilder()
    .setAccentColor(0x3f7ff1)

    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent("## Server Configuration")
    )
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      (textDisplay) =>
        textDisplay.setContent(
          autoRoles.length
            ? `**Autoroles**\n${formatRoles(autoRoles)}`
            : "**Autoroles**\nNot configured"
        ),
      (textDisplay) =>
        textDisplay.setContent(
          "Select up to 10 roles to be automatically assigned to new members when they join the server.",
        )
    )
    .addActionRowComponents((actionRow) =>
      actionRow.setComponents(new RoleSelectMenuBuilder()
        .setCustomId("serverconfig_autoRoles")
        .setPlaceholder("Select auto role(s)")
        .setMinValues(0)
        .setMaxValues(10)
        .setDefaultRoles(autoRoles.slice(0, 10))
      )
    )

  const exitbutton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("serverconfig_exit")
      .setLabel("Save & Exit")
      .setStyle(ButtonStyle.Primary)
  );

  return { components: [container, exitbutton] };
};

module.exports = { ServerConfigComponent };

const {
  SlashCommandBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionsBitField,
  ChannelSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");
const { ServerConfig, Application } = require("../../dbObjects.js");
const { createTempApplication } = require("../../js/tempconfigfuncs.js");
const { ServerConfigComponent } = require("../../js/serverConfigUI.js");

const generalinfo = require("../../button_commands/setupbuttons/generalinfo.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up applications for your server")
    .setContexts(0)
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new application')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the new application')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit an existing application')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the application to edit')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete an existing application')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the application to delete')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all applications for this server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('server')
        .setDescription('Edit server-wide configuration')
    ),

  async autocomplete(interaction) {
    const applications = await Application.findAll({
      where: { server_id: interaction.guild.id },
    });

    const focusedValue = interaction.options.getFocused().toLowerCase();
    const filtered = applications
      .map((app) => app.name)
      .filter((name) => name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(filtered.map((name) => ({ name, value: name })));
  },

  async execute({ interaction, client }) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({
        content: "You need the `Manage Server` permission to run setup.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const name = interaction.options.getString('name');
    let serverConfig = await ServerConfig.findOne({
      where: { server_id: interaction.guild.id },
    });

    if (!serverConfig) {
      serverConfig = await ServerConfig.create({
        server_id: interaction.guild.id,
        autorole: [],
      });
    }

    const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });
    const maxApps = serverConfig.maxApplications || 5;

    if (subcommand === 'create') {
      if (applications.length >= maxApps) {
        return interaction.reply({
          content: `You can only have up to ${maxApps} applications.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const existing = applications.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        return interaction.reply({
          content: 'An application with this name already exists.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const { tempApp, created } = await createTempApplication(interaction.guild.id, { name });
      if (!created) {
        const embed = new EmbedBuilder()
          .setTitle("Ongoing Application Setup")
          .setDescription(`Setup for "${name}" is already in progress. Continue or start a new one?`)
          .setColor("#3f7ff1");
        // const buttons = new ActionRowBuilder().addComponents(
        //   new ButtonBuilder().setCustomId(`continue_app_${tempApp.name}`).setLabel("Continue").setStyle("Primary"),
        //   new ButtonBuilder().setCustomId(`cancelsetup_${tempApp.name}`).setLabel("Cancel").setStyle("Danger"),
        // );
      const continuebuttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("generalinfo_" + tempApp.name + "_false")
          .setLabel("Continue previous setup")
          .setStyle("Success"),
        new ButtonBuilder()
          .setCustomId("generalinfo_" + tempApp.name + "_true")
          .setLabel("Start New Setup")
          .setStyle("Primary"),
      );
        return interaction.reply({ embeds: [embed], components: [continuebuttons] });
      }

      const nextbuttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`next_0_${tempApp.name}`)
          .setLabel("Next")
          .setStyle("Primary")
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`cancelsetup_${tempApp.name}`)
          .setLabel("Cancel")
          .setStyle("Danger"),
      );

      const generalembed = new EmbedBuilder()
        .setColor("#3f7ff1")
        .setTitle(`Application Setup: ${name}`)
        .setDescription(
          `[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nWelcome to the setup of ${name}! I will guide you through the setup process. I need 4 things to be set up in order to start securing your server. We'll start with the User Verification Start Channel.\n\nPlease select the channel where users will start the verification process and then click the "Next" button below to continue...`,
        )
        .addFields({
          name: "User Verification Channel `(required)`",
          value: `No channel set up yet`,
          inline: false,
        });

      const channelmenu = new ChannelSelectMenuBuilder()
        .setCustomId(`firstTimeMenu_0_${tempApp.name}`)
        .addChannelTypes("GuildText")
        .setPlaceholder("Select the channel users will start verification in")
        .setMinValues(1)
        .setMaxValues(1);

      const verificationchannelmenu = new ActionRowBuilder().setComponents(channelmenu);

      await interaction.reply({
        embeds: [generalembed],
        components: [verificationchannelmenu, nextbuttons],
      });
    } 
    
    
    else if (subcommand === 'edit') {
      const app = applications.find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!app) {
        return interaction.reply({
          content: 'Application not found.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const { tempApp, created } = await createTempApplication(interaction.guild.id, { name: app.name });
      if (!created) {
        const embed = new EmbedBuilder()
          .setTitle("Ongoing Application Edit")
          .setDescription(`Edit for "${app.name}" is already in progress. Continue or start a new one?`)
          .setColor("#3f7ff1");
        // const buttons = new ActionRowBuilder().addComponents(
        //   new ButtonBuilder().setCustomId(`continue_app_${tempApp.name}`).setLabel("Continue").setStyle("Primary"),
        //   new ButtonBuilder().setCustomId(`cancelsetup_${tempApp.name}`).setLabel("Cancel").setStyle("Danger"),
        // );
        const continuebuttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("generalinfo_" + tempApp.name + "_false")
            .setLabel("Continue previous setup")
            .setStyle("Success"),
          new ButtonBuilder()
            .setCustomId("generalinfo_" + tempApp.name + "_true")
            .setLabel("Start New Setup")
            .setStyle("Primary"),
        );
        return interaction.reply({ embeds: [embed], components: [continuebuttons] });
      }

      // First time edit for this app
      generalinfo({ interaction, client, appName: tempApp.name });
    }


    else if (subcommand === 'server') {
      const component = ServerConfigComponent({
        guild: interaction.guild,
        serverConfig,
        applicationCount: applications.length,
      });

      return interaction.reply({
        ...component,
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    else if (subcommand === 'list') {
      if (applications.length === 0) {
        return interaction.reply({
          content: 'No applications found for this server.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const appList = applications
        .map(app => `- **${app.name}**`)
        .join('\n');

      const applicationlistEmbed = new EmbedBuilder()
        .setTitle("Applications List")
        .setDescription(`You currently have ${applications.length} applications set up, you can configure them using these commands:\nEdit: \`/setup edit <name>\`\nDelete: \`/setup delete <name>\`\n${appList}`)
        .setColor("#3f7ff1");


      return interaction.reply({
        // content: `Applications for this server:\n${appList}`,
        embeds: [applicationlistEmbed],
      });
    }
  },
};

const { Events, MessageFlags } = require("discord.js");
const {
  updateCommandUsage,
  updateComponentUsage,
} = require("../js/tempconfigfuncs.js");
const ErrorHandler = require("../js/ErrorHandling.js");
const { Application } = require("../dbObjects.js");

const interactionCache = new Map();
const CACHE_TTL = 15000;
const MAX_CACHE_SIZE = 1000;

const checkDuplicatesFor = ["verifyconfirm", "denyconfirm", "actionconfirm"];

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (
        !interaction //||
        // (!interaction.isCommand() &&
        //   !interaction.isButton() &&
        //   !interaction.isStringSelectMenu() &&
        //   !interaction.isChannelSelectMenu() &&
        //   !interaction.isRoleSelectMenu() &&
        //   !interaction.isMentionableSelectMenu() &&
        //   !interaction.isUserSelectMenu() &&
        //   !interaction.isModalSubmit())
      ) {
        return;
      }

      if (interaction.isChatInputCommand()) {
        return await handleSlashCommand(interaction, client);
      }

      const [command, ...context] = interaction.customId?.split("_") || [];
      const cacheKey = `${interaction.user.id}-${command}-${interaction.customId}`;

      if (checkDuplicatesFor.includes(command)) {
        const cached = interactionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          console.log(`Ignoring duplicate interaction: ${cacheKey}`);
          return interaction
            .reply({
              content: "⏳ Please wait 15 seconds before trying again.",
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }

        if (interactionCache.size >= MAX_CACHE_SIZE) {
          const oldestKey = interactionCache.keys().next().value;
          interactionCache.delete(oldestKey);
        }

        interactionCache.set(cacheKey, {
          timestamp: Date.now(),
          processed: true,
        });
      }

      const userid = await extractUserId(interaction);
      const data = { interaction, client, context, userid };

      console.time(`Interaction handled: ${interaction.customId}`);
      if (interaction.isButton()) {
        await handleButton(command, data, client, interaction);
      } else if (isSelectMenu(interaction)) {
        await handleMenu(command, data, client, interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(command, data, client, interaction);
      // } else if (interaction.isAutocomplete()) {
      //   if (interaction.commandName === 'setup' && interaction.options.getFocused(true).name === 'verification') {
      //     const focusedValue = interaction.options.getFocused();
      //     // const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });
      //     const applications = ['verification', 'staff app']

      //     // Filter suggestions based on user input
      //     const filtered = applications
      //       // .filter(app => app.name.toLowerCase().includes(focusedValue.toLowerCase()))
      //       .filter(app => app.toLowerCase().includes(focusedValue.toLowerCase())) // app is a string, so no .name
      //       .slice(0, 25) // Discord limits to 25 choices
      //       .map(app => ({ name: app, value: app })); // Fixed: Use app directly
      //       // .map(app => ({ name: app.name, value: app.name }));

      //     // Always include "new" as an option
      //     const choices = [{ name: 'Create New Application', value: 'new' }, ...filtered];

      //     await interaction.respond(choices);
      //   }
      }
      else if (interaction.isAutocomplete() && interaction.commandName === 'setup' && interaction.options.getSubcommand() === 'edit') {
        const focusedValue = interaction.options.getFocused();
        const applications = await Application.findAll({ where: { server_id: interaction.guild.id } });
        const filtered = applications
          .filter(app => app.name.toLowerCase().includes(focusedValue.toLowerCase()))
          .slice(0, 25)
          .map(app => ({ name: app.name, value: app.name }));
        await interaction.respond(filtered);
      }

      // Update usage stats
      if (!interaction.customId?.includes("cancelverification") && interaction.customId) {
        console.timeEnd(`Interaction handled: ${interaction.customId}`);
        updateComponentUsage(command).catch((err) =>
          console.error("Failed to update component usage:", err),
        );
        // console.log(`Interaction received: ${interaction.customId}`);
      }
    } catch (error) {
      console.log(error);
      await ErrorHandler.handle(client, error, interaction);
    }
  },
};

// Cleanup cache every minute
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of interactionCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      interactionCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} expired interaction cache entries`);
  }
}, 60000);

async function handleSlashCommand(interaction, client) {
  try {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`,
      );
      return;
    }

    if (interaction.guildId === null) {
      return interaction.reply({
        content: "Sorry, I don't have commands available in DMs.",
        flags: MessageFlags.Ephemeral,
      });
    }

    console.time(`Command executed: ${command.data.name}`)
    await command.execute({ interaction, client });
    console.timeEnd(`Command executed: ${command.data.name}`);
    await updateCommandUsage(command.data.name);
  } catch (error) {
    await ErrorHandler.handle(client, error, interaction);
  }
}

function isSelectMenu(interaction) {
  return (
    interaction.isStringSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isRoleSelectMenu()
  );
}

async function handleButton(command, data, client, interaction) {
  try {
    if (
      interaction.message.interaction !== null &&
      interaction.user.id !== interaction.message.interaction?.user?.id
    ) {
      return interaction.reply({
        content: `Hey! That's someone else's business!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const handler = data.client.buttonCommands.get(command);
    if (!handler) {
      return;
    }

    await handler(data);
  } catch (error) {
    await ErrorHandler.handle(client, error, interaction);
  }
}

async function handleMenu(command, data, client, interaction) {
  try {
    if (
      interaction.message.interaction !== null &&
      interaction.user.id !== interaction.message.interaction?.user?.id
    ) {
      return interaction.reply({
        content: `Hey! That's someone else's business!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const handler = data.client.menus.get(command);
    if (!handler) {
      console.warn(`No menu handler found for: ${command}`);
      return;
    }

    await handler(data);
  } catch (error) {
    await ErrorHandler.handle(client, error, interaction);
  }
}

async function handleModal(command, data, client, interaction) {
  try {
    const handler = data.client.modals.get(command);
    if (!handler) {
      console.warn(`No modal handler found for: ${command}`);
      return;
    }

    await handler(data);
  } catch (error) {
    await ErrorHandler.handle(client, error, interaction);
  }
}

async function extractUserId(interaction) {
  if (interaction.message?.embeds[0]) {
    if (!interaction.message?.embeds[0]?.footer) return null;
    const footerText = interaction.message.embeds[0].footer.text;
    if (footerText.startsWith("DM | ")) return footerText.slice(5);
    if (footerText.startsWith("DMTimeout | ")) return footerText.slice(12);
    if (footerText.startsWith("Denied | ")) return footerText.slice(9);
    return footerText;
  } else if (interaction.message?.flags?.has(MessageFlags.IsComponentsV2)) {
    let userId;

    if (
      interaction.customId.includes("question_") ||
      interaction.customId.includes("questionModal_")
    ) {
      // Extract userId from interaction ID
      const userIdMatch = await interaction.customId.match(/_(\d+)$/);
      if (userIdMatch && userIdMatch[1]) {
        userId = await userIdMatch[1];
        console.log(`Extracted User ID from interaction ID: ${userId}`);
        return userId;
      }
    }

    const containerContent =
      interaction.message.components?.[0]?.components?.[0]?.components?.[0]
        ?.content;

    if (containerContent) {
      // Extract userId using regex
      const userIdMatch = containerContent.match(/\*\*User ID:\*\* `(\d+)`/);
      if (userIdMatch && userIdMatch[1]) {
        userId = userIdMatch[1];
        console.log(`Extracted User ID: ${userId}`);
      } else {
        // Fallback to footer text if available
        const footerText = interaction.message.embeds?.[0]?.footer?.text;
        if (footerText && /^\d+$/.test(footerText)) {
          userId = footerText;
          console.log(`Using User ID from footer: ${userId}`);
        }
      }
    }
    return userId;
  } else {
    return null;
  }
}

const { Events, MessageFlags } = require("discord.js");
const {
  updateCommandUsage,
  updateComponentUsage,
} = require("../js/tempconfigfuncs.js");
const ErrorHandler = require("../js/ErrorHandling.js");

const interactionCache = new Map();
const CACHE_TTL = 5000;
const MAX_CACHE_SIZE = 1000;

const checkDuplicatesFor = ["verifyconfirm", "denyconfirm", "actionconfirm", "answerquestion"];

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (!interaction) {
        return;
      }

      if (interaction.isChatInputCommand()) {
        return await handleSlashCommand(interaction, client);
      }
      else if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.error(`No command matching ${interaction.commandName} was found.`);
          return;
        }
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(error);
        }
      }

      const [command, ...context] = interaction.customId?.split("_") || [];
      const cacheKey = `${interaction.user.id}-${command}-${interaction.customId}`;

      if (checkDuplicatesFor.includes(command)) {
        const cached = interactionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          return interaction
            .reply({
              content: "⏳ Please wait 5 seconds before trying again.",
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
      
      let applicationId = null;
      let tempApplicationId = null;
      
      if (context.length > 0 && context[0] && context[0].length < 17) {
        const parsed = parseInt(context[0], 10);
        if (!isNaN(parsed)) {
          if (command.includes("info") || command === "next" || command === "cancelsetup" || command === "finishsetup" || command === "toggleusethreads" || command === "setverifyfilter") {
            tempApplicationId = parsed;
          } else {
            applicationId = parsed;
          }
        }
      }
      
      const data = { interaction, client, context, userid, applicationId, tempApplicationId };

      if(interaction.customId) {
        console.log(`Interaction handled: ${interaction.customId}`);
      }
      
      if (interaction.isButton()) {
        await handleInteraction(command, data, client, interaction, "buttonCommands", true);
      } else if (isSelectMenu(interaction)) {
        await handleInteraction(command, data, client, interaction, "menus", true);
      } else if (interaction.isModalSubmit()) {
        await handleInteraction(command, data, client, interaction, "modals", false);
      }

      // Update usage stats
      if (!interaction.customId?.includes("cancelverification") && interaction.customId) {
        // console.timeEnd(`Interaction handled: ${interaction.customId}`);
        updateComponentUsage(command).catch((err) =>
          console.error("Failed to update component usage:", err),
        );
      }
    } catch (error) {
      console.error(`Error processing interaction ${interaction.customId}:`, error);
      await ErrorHandler.handle(client, error, interaction);
    }
  },
};

// Cleanup cache every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of interactionCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      interactionCache.delete(key);
    }
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

    await command.execute({ interaction, client });
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

async function handleInteraction(command, data, client, interaction, collectionName, checkOwnership = true) {
  try {
    if (
      checkOwnership &&
      interaction.message?.interaction !== null &&
      interaction.user.id !== interaction.message.interaction?.user?.id
    ) {
      return interaction.reply({
        content: `Hey! That's someone else's business!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const handler = data.client[collectionName].get(command);
    if (!handler) {
      return;
    }

    await handler(data);
  } catch (error) {
    await ErrorHandler.handle(client, error, interaction);
  }
}

async function extractUserId(interaction) {
  if (interaction.message?.embeds[0]?.footer) {
    const footerText = interaction.message.embeds[0].footer.text;
    if (footerText.startsWith("DM | ")) return footerText.slice(5);
    if (footerText.startsWith("DMTimeout | ")) return footerText.slice(12);
    if (footerText.startsWith("Denied | ")) return footerText.slice(9);
    return footerText;
  }

  if (
    interaction.customId &&
    (interaction.customId.includes("question_") ||
      interaction.customId.includes("questionModal_") ||
      interaction.customId.includes("denyModal_"))
  ) {
    const userIdMatch = interaction.customId.match(/_(\d+)$/);
    if (userIdMatch?.[1] && userIdMatch?.[1].length >= 17) {
      return userIdMatch[1];
    }
  }
  
  if (interaction.message?.flags?.has(MessageFlags.IsComponentsV2)) {
    const containerContent =
      interaction.message.components?.[0]?.components?.[0]?.components?.[0]?.content;

    if (containerContent) {
      const userIdMatch = containerContent.match(/\*\*User ID:\*\* `(\d+)`/);
      if (userIdMatch?.[1]) {
        return userIdMatch[1];
      }
    }
    
    const footerText = interaction.message.embeds?.[0]?.footer?.text;
    if (footerText && /^\d+$/.test(footerText)) {
      return footerText;
    }
  }
  
  return null;
}

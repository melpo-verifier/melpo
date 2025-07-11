// Usage: node deploy-commands-global.js <BOT_NAME>

const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

// Commands that should not be deployed globally
const blacklistedCommands = ["whitelist.js"];

if (process.argv.length < 3)
  return console.error("Please provide a bot name as a command-line argument.");
const botName = process.argv[2].toUpperCase();

const commands = [];
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      if (blacklistedCommands.includes(file)) {
        console.log(`[INFO] Skipping blacklisted command: ${file}`);
        continue;
      }
      commands.push(command.data.toJSON());
    } else {
      console.log(
        `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

const rest = new REST().setToken(process.env[`${botName}_TOKEN`]);

(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} global application (/) commands.`,
    );

    await rest.put(Routes.applicationCommands(process.env[`${botName}_ID`]), {
      body: commands,
    });

    console.log(
      `Successfully reloaded ${commands.length} global application (/) commands.`,
    );
  } catch (error) {
    console.error(error);
  }
})();

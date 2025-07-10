const { REST, Routes } = require("discord.js");
require("dotenv").config();

if (process.argv.length < 3)
  return console.error("Please provide a bot name as a command-line argument.");
const botName = process.argv[2].toUpperCase();

// Commands that should not be deleted globally
const blacklistedCommands = ["whitelist.js"];

const rest = new REST().setToken(process.env[`${botName}_TOKEN`]);

async function deleteCommands() {
  try {
    const commands = await rest.get(
      Routes.applicationCommands(process.env[`${botName}_ID`]),
    );

    const commandsToDelete = commands.filter((cmd) =>
      blacklistedCommands.includes(`${cmd.name}.js`),
    );

    console.log(`Found ${commandsToDelete.length} commands to delete`);

    for (const command of commandsToDelete) {
      await rest.delete(
        Routes.applicationCommand(process.env[`${botName}_ID`], command.id),
      );
      console.log(`Deleted command ${command.name}`);
    }

    console.log("Successfully removed specified commands globally");
  } catch (error) {
    console.error(error);
  }
}

deleteCommands();

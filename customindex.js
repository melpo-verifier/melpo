// Usage: start a non-sharded bot instance like this: node customindex.js <botname>

const { createBot } = require("./bot.js");
require("dotenv").config();

const botName = process.argv[2].toUpperCase();
if (!botName || botName === "sharded") {
  console.error(
    "Please provide a bot name as a command-line argument like so: node customindex.js <botname>",
  );
  process.exit(1);
}

console.log(botName);

if (!process.env[`${botName}_TOKEN`]) {
  console.error("Bot not found.");
  process.exit(1);
}

createBot(process.env[`${botName}_TOKEN`]); // Create the singular bot instance

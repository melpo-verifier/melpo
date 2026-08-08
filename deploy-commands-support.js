// This script deploys commands in commands/staff to preconfigured support guild.
const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
require("./util/env_manager.js").config(); //Attempt to read .env if we need to.

const commands = [];
const foldersPath = path.join(__dirname, "commands/staff");
const commandFolder = fs.readdirSync(foldersPath);

for (const file of commandFolder) {
	const filePath = path.join(foldersPath, file);
	const command = require(filePath);

	if ("data" in command && "execute" in command) commands.push(command.data.toJSON());
	else console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
}

const rest = new REST().setToken(process.env.MELPO_TOKEN);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		const data = await rest.put(Routes.applicationGuildCommands(process.env.MELPO_ID, process.env.SUPPORTSERVER_ID), {
			body: commands,
		});

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})().catch(() => {});

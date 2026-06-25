const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { Instances } = require("./dbObjects.js");
require("./util/env_manager.js").config(); //Attempt to read .env if we need to.
const { decryptData } = require("./js/DBFunctions.js");

// Commands that should not be deployed globally
const blacklistedCommands = ["whitelist.js"];
const args = process.argv.slice(2);
const shouldClear = args.includes("--clear");
let botNameArg = null;
let clientIdArg = null;

for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--clientId" && args[i + 1]) {
		clientIdArg = String(args[i + 1])
			.trim()
			.replace(/^"|"$/g, "");

		i += 1;
		continue;
	}

	if (args[i] === "--botName" && args[i + 1]) {
		botNameArg = args[i + 1];
		i += 1;
		continue;
	}

	if (!args[i].startsWith("--") && !botNameArg) botNameArg = args[i];
}

if (!botNameArg && !clientIdArg) {
	console.error("Please provide either <BOT_NAME> or --clientId <CLIENT_ID>.");
	process.exit(1);
}

async function resolveDeployCredentials() {
	if (clientIdArg) {
		const instance = await Instances.findOne({ where: { client_id: clientIdArg } });
		//if (!instance || !instance.bot_token) throw new Error(`No instance token found for client ID ${clientIdArg}.`);
		if (!instance?.bot_token) throw new Error(`No instance token found for client ID ${clientIdArg}.`);

		return { token: decryptData(instance.bot_token), applicationId: instance.client_id };
	}

	const botName = botNameArg.toUpperCase();
	const token = process.env[`${botName}_TOKEN`];
	const applicationId = process.env[`${botName}_ID`];

	if (!token || !applicationId) throw new Error(`Missing ${botName}_TOKEN or ${botName}_ID in environment.`);

	return { token, applicationId };
}

const commands = [];

if (!shouldClear) {
	const foldersPath = path.join(__dirname, "commands");
	const commandFolders = fs.readdirSync(foldersPath);

	for (const folder of commandFolders) {
		// Skip the 'owner' directory
		if (folder === "owner") {
			console.log(`Skipping owner commands.`);
			continue;
		}
		const commandsPath = path.join(foldersPath, folder);
		const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

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
				console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
			}
		}
	}
}

(async () => {
	try {
		const { token, applicationId } = await resolveDeployCredentials();
		const rest = new REST().setToken(token);

		if (shouldClear) console.log(`Started clearing global application (/) commands for ${applicationId}.`);
		else console.log(`Started refreshing ${commands.length} global application (/) commands.`);

		await rest.put(Routes.applicationCommands(applicationId), { body: commands });

		if (shouldClear) console.log(`Successfully cleared global application (/) commands for ${applicationId}.`);
		else console.log(`Successfully reloaded ${commands.length} global application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})().catch(() => {});

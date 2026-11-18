const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { Instances, sequelize } = require("./dbObjects.js");
require("./util/env_manager.js").config(); //Attempt to read .env if we need to.
const { decryptData } = require("./js/DBFunctions.js");

// Commands that should not be deployed globally
const blacklistedCommands = ["addpremium.js"];
const args = process.argv.slice(2);
const shouldClear = args.includes("--clear");
const allInstances = args.includes("--all-instances");
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

if (!allInstances && !botNameArg && !clientIdArg) {
	console.error("Please provide <BOT_NAME>, --clientId <CLIENT_ID>, or --all-instances.");
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

async function deployCommandsForTarget({ token, applicationId }) {
	const rest = new REST().setToken(token);

	if (shouldClear) console.log(`Started clearing global application (/) commands for ${applicationId}.`);
	else console.log(`Started refreshing ${commands.length} global application (/) commands for ${applicationId}.`);

	await rest.put(Routes.applicationCommands(applicationId), { body: commands });

	if (shouldClear) console.log(`Successfully cleared global application (/) commands for ${applicationId}.`);
	else console.log(`Successfully reloaded ${commands.length} global application (/) commands for ${applicationId}.`);
}

(async () => {
	try {
		if (allInstances) {
			const activeInstances = await Instances.findAll({ where: { active: true } });
			const whitelabelInstances = activeInstances.filter(
				(instance) => Boolean(instance.bot_token) && instance.client_id !== process.env.MELPO_ID,
			);

			if (whitelabelInstances.length === 0) {
				console.log("No active whitelabel instances with a bot token found.");
				return;
			}

			for (const instance of whitelabelInstances) {
				try {
					const token = decryptData(instance.bot_token);
					await deployCommandsForTarget({ token, applicationId: instance.client_id });
				} catch (error) {
					console.warn(`[WARNING] Failed to deploy commands for instance ${instance.client_id}:`, error);
				}
			}
			return;
		}

		const { token, applicationId } = await resolveDeployCredentials();
		await deployCommandsForTarget({ token, applicationId });
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	} finally {
		await sequelize.close().catch(() => {});
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

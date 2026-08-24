const { createBot } = require("./bot.js");
const { Instances } = require("./dbObjects.js");
const { decryptData } = require("./js/DBFunctions.js");
require("./util/env_manager.js").config(); //Attempt to read .env if we need to.

async function bootstrap() {
	const arg = process.argv[2];
	if (!arg || arg.toLowerCase() === "sharded") {
		throw new Error("Missing instance reference. Usage: node customindex.js <NAME>");
	}

	const ref = arg.trim().replace(/^"|"$/g, "");
	const envKey = String(ref.toUpperCase()).concat("_TOKEN");

	let rawToken = process.env[envKey] || process.env[ref];

	if (!rawToken) {
		const instance = await Instances.findOne({ where: { client_id: ref } });
		rawToken = instance?.bot_token;
	}

	if (!rawToken) {
		throw new Error(`Could not find a token for: ${ref}`);
	}

	const token = decryptData(rawToken);
	console.log(`Starting bot: ${ref}`);
	await createBot(token);
}

bootstrap().catch((err) => {
	console.error("Bootstrap Error:", err.message);
	process.exit(1);
});

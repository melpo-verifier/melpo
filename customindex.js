const crypto = require("crypto");
const { createBot } = require("./bot.js");
const { Instances, UserBilling } = require("./dbObjects.js");
const cron = require("node-cron");
require("dotenv").config();

const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY || "";
  return Buffer.from(key.padEnd(32, "\0")).subarray(0, 32);
};

function decryptToken(text) {
  if (!text?.includes(":")) return text;

  try {
    const [ivHex, dataHex] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(dataHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKey(), iv);
    
    return Buffer.concat([
      decipher.update(encryptedText), 
      decipher.final()
    ]).toString();
  } catch (err) {
    console.warn("Decryption failed; using raw value.");
    return text;
  }
}

async function bootstrap() {
  const arg = process.argv[2];
  if (!arg || arg.toLowerCase() === "sharded") {
    throw new Error("Missing instance reference. Usage: node customindex.js <NAME>");
  }

  const ref = arg.trim().replace(/^"|"$/g, "");
  const envKey = ref.toUpperCase() + "_TOKEN";

  let rawToken = process.env[envKey] || process.env[ref];

  if (!rawToken) {
    const instance = await Instances.findOne({ where: { client_id: ref } });
    rawToken = instance?.bot_token;
  }

  if (!rawToken) {
    throw new Error(`Could not find a token for: ${ref}`);
  }

  const token = decryptToken(rawToken);
  console.log(`Starting bot: ${ref}`);
  await createBot(token);
}

bootstrap().catch(err => {
  console.error("Bootstrap Error:", err.message);
  process.exit(1);
});
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const [, , action, name, token, clientId] = process.argv;

if (!action || !name || (action === "add" && (!token || !clientId))) {
  console.error(
    "Usage for add:    node token.js add <name> <token> <clientId>",
  );
  console.error("Usage for remove: node token.js remove <name>");
  process.exit(1);
}

const envFilePath = path.join(__dirname, ".env");
const data = fs.readFileSync(envFilePath, "utf8");
const lines = data.split("\n");
const upperName = name.toUpperCase();

if (action === "add") {
  let found = false;
  for (const line of lines) {
    if (
      line.startsWith(`${upperName}_TOKEN=`) ||
      line.startsWith(`${upperName}_ID=`)
    ) {
      found = true;
    }
  }

  if (found) {
    console.log(
      `Bot name already exists with id: ${process.env[`${upperName}_ID`]}.`,
    );
  } else {
    fs.appendFileSync(envFilePath, `\n${upperName}_TOKEN=${token}`);
    fs.appendFileSync(envFilePath, `\n${upperName}_ID=${clientId}`);
    console.log(`Token and client ID added for ${upperName}.`);

    // Deploy commands
    const deploy = spawnSync("node", ["deploy-commands-global.js", upperName], {
      stdio: "inherit",
    });
    if (deploy.status !== 0) {
      console.error("Failed to deploy commands.");
    }
  }
} else if (action === "remove") {
  if (upperName === "MELPO") {
    console.log("You cannot remove the token for Melpo.");
    process.exit(1);
  }
  let found = false;
  const newLines = [];
  for (const line of lines) {
    if (
      line.startsWith(`${upperName}_TOKEN=`) ||
      line.startsWith(`${upperName}_ID=`)
    ) {
      found = true;
    } else {
      newLines.push(line);
    }
  }
  if (!found) {
    console.log("Bot not found.");
  } else {
    fs.writeFileSync(envFilePath, newLines.join("\n"));
    console.log(`Token and client ID removed for ${upperName}.`);

    // Delete commands
    const del = spawnSync("node", ["delete-commands-global.js", upperName], {
      stdio: "inherit",
    });
    if (del.status !== 0) {
      console.error("Failed to delete commands.");
    }
  }
} else {
  console.error('Invalid action. Use "add" or "remove".');
  process.exit(1);
}

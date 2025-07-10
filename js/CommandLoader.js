const fs = require("node:fs");
const path = require("node:path");
const { Collection } = require("discord.js");

class CommandLoader {
  constructor(client) {
    this.client = client;
    this.basePath = process.cwd();
    this.client.commands = new Collection();
    this.client.buttonCommands = new Collection();
    this.client.menus = new Collection();
    this.client.modals = new Collection();
    this.loadedModules = new Set();
  }

  loadAll() {
    const startTime = Date.now();
    console.log("Starting to load all commands...");

    try {
      Promise.all([
        this.loadCommands(),
        this.loadButtonCommands(),
        this.loadMenus(),
        this.loadModals(),
      ])
        .then(() => {
          const loadTime = Date.now() - startTime;
          console.log(`All commands loaded successfully in ${loadTime}ms`);
          console.log(
            `Loaded: ${this.client.commands.size} commands, ${this.client.buttonCommands.size} button commands, ${this.client.menus.size} menus, ${this.client.modals.size} modals`,
          );

          this.client.commandLoader = this;
        })
        .catch((error) => {
          console.error("Failed to load commands:", error);
        });
    } catch (error) {
      console.error("Failed to load commands:", error);
    }
  }

  loadCommands() {
    try {
      const foldersPath = path.join(this.basePath, "commands");
      if (!fs.existsSync(foldersPath)) {
        console.warn("Commands directory not found");
        return;
      }

      const commandFolders = fs
        .readdirSync(foldersPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        ?.map((dirent) => dirent.name);

      for (const folder of commandFolders) {
        try {
          const commandsPath = path.join(foldersPath, folder);
          const commandFiles = fs
            .readdirSync(commandsPath, { withFileTypes: true })
            .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".js"))
            ?.map((dirent) => dirent.name);

          for (const file of commandFiles) {
            this.loadSingleCommand(commandsPath, file, folder);
          }
        } catch (error) {
          console.error(`Failed to read folder ${folder}:`, error.message);
        }
      }
    } catch (error) {
      console.error("Failed to load commands:", error.message);
    }
  }

  loadSingleCommand(commandsPath, file, folder) {
    try {
      const filePath = path.join(commandsPath, file);

      if (this.loadedModules.has(filePath)) {
        delete require.cache[require.resolve(filePath)];
      }

      const command = require(filePath);
      this.loadedModules.add(filePath);

      if ("data" in command && "execute" in command) {
        if (!command.data.name) {
          console.warn(
            `[WARNING] Command at ${filePath} missing name property`,
          );
          return;
        }

        this.client.commands.set(command.data.name, command);
        console.log(`✓ Loaded command: ${command.data.name} from ${folder}`);
      } else {
        console.warn(
          `[WARNING] Command at ${filePath} missing required properties (data/execute)`,
        );
      }
    } catch (error) {
      console.error(`Failed to load command ${file}:`, error.message);
    }
  }

  loadButtonCommands() {
    this.loadFromDirectory(
      "./button_commands",
      this.client.buttonCommands,
      "button command",
    );

    const subDirs = ["setupbuttons", "customization"];
    subDirs.forEach((dir) => {
      this.loadFromDirectory(
        `./button_commands/${dir}`,
        this.client.buttonCommands,
        "button command",
      );
    });
  }

  loadMenus() {
    this.loadFromDirectory("./menu_commands", this.client.menus, "menu");
  }

  loadModals() {
    this.loadFromDirectory("./modal_commands", this.client.modals, "modal");
  }

  loadFromDirectory(directory, collection, type = "command") {
    try {
      const fullPath = path.join(this.basePath, directory);
      if (!fs.existsSync(fullPath)) {
        console.warn(`Directory not found: ${directory}`);
        return;
      }

      const files = fs
        .readdirSync(fullPath, { withFileTypes: true })
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".js"))
        ?.map((dirent) => dirent.name);

      for (const file of files) {
        try {
          const filePath = path.join(directory, file);
          const absolutePath = path.join(this.basePath, filePath);

          if (this.loadedModules.has(absolutePath)) {
            delete require.cache[require.resolve(absolutePath)];
          }

          const command = require(absolutePath);
          const commandName = path.basename(file, ".js");

          this.loadedModules.add(absolutePath);
          collection.set(commandName, command);
          console.log(`✓ Loaded ${type}: ${commandName} from ${directory}`);
        } catch (error) {
          console.error(`Failed to load ${type} ${file}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Failed to read directory ${directory}:`, error.message);
    }
  }

  clearCache() {
    for (const modulePath of this.loadedModules) {
      delete require.cache[modulePath];
    }
    this.loadedModules.clear();
    console.log("Command cache cleared");
  }

  reloadCommand(commandName) {
    try {
      const command = this.client.commands.get(commandName);
      if (!command) {
        throw new Error(`Command ${commandName} not found`);
      }

      for (const [filePath] of this.loadedModules) {
        if (filePath.includes(commandName)) {
          delete require.cache[require.resolve(filePath)];
          const newCommand = require(filePath);
          this.client.commands.set(commandName, newCommand);
          console.log(`✓ Reloaded command: ${commandName}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error(`Failed to reload command ${commandName}:`, error.message);
      return false;
    }
  }
}

module.exports = CommandLoader;

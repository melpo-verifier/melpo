// Experimental code to watch for code change and reload commands dynamically, It does sort of work, but comes with many other issues.

const fs = require("fs");
const path = require("path");

const skipFiles = [
  "index.js",
  "watcher.js",
  "bot.js",
  "deploy-commands-global.js",
  "deploy-commands.js",
  "dbInit.js",
  "dbObjects.js",
];
const skipFolders = ["node_modules", "disabled commands&unused js"];

async function clearAndRecacheModule(modulePath, client) {
  const resolvedPath = require.resolve(modulePath);

  if (require.cache[resolvedPath]) {
    const isSkippedFile = skipFiles.some(
      (file) => resolvedPath === path.join(__dirname, file),
    );
    const isSkippedFolder = skipFolders.some((folder) =>
      resolvedPath.includes(path.join(__dirname, folder)),
    );

    if (isSkippedFile || isSkippedFolder) {
      return;
    }
    delete require.cache[resolvedPath];
    // const newModule = require(resolvedPath);
    // client.commands.set(newCommand.data.name, newCommand);
    // console.log(`Reloaded command: ${newCommand.data.name}`);

    // if (newCommand && newCommand.data && newCommand.execute) {
    //     client.commands.set(newCommand.data.name, newCommand);
    //     console.log(`Reloaded command: ${newCommand.data.name}`);

    // } else {
    //     console.log(`Skipped reloading non-command module: ${resolvedPath}`);
    // }

    // console.log(newModule)

    try {
      const newModule = require(resolvedPath);

      if (newModule && newModule.data && newModule.execute) {
        client.commands.set(newModule.data.name, newModule);
        console.log(`Reloaded command: ${newModule.data.name}`);
      } else if (
        typeof newModule === "function" &&
        modulePath.includes("button_commands")
      ) {
        client.buttonCommands.set(path.basename(modulePath, ".js"), newModule);
        console.log(
          `Reloaded button command: ${path.basename(modulePath, ".js")}`,
        );
      } else if (
        typeof newModule === "function" &&
        modulePath.includes("menu_commands")
      ) {
        client.menus.set(path.basename(modulePath, ".js"), newModule);
        console.log(`Reloaded menu: ${path.basename(modulePath, ".js")}`);
      } else if (
        typeof newModule === "function" &&
        modulePath.includes("modal_commands")
      ) {
        client.modals.set(path.basename(modulePath, ".js"), newModule);
        console.log(`Reloaded modal: ${path.basename(modulePath, ".js")}`);
      } else if (
        typeof newModule === "function" &&
        newModule.constructor.name === "AsyncFunction"
      ) {
        await newModule(client);
        console.log(`Executed async function module: ${resolvedPath}`);
      } else {
        console.log(`Skipped reloading non-command module: ${resolvedPath}`);
      }
    } catch (error) {
      console.error(`Failed to reload module: ${resolvedPath}`, error);
    }
  }
}

// function watchCommands(directory, client) {
//     const fullPath = path.resolve(directory);
//     fs.watch(fullPath, (eventType, filename) => {
//         if (eventType === 'change' && filename.endsWith('.js')) {
//         const filePath = path.join(fullPath, filename);
//         console.log(`Detected change in command file: ${filePath}`);
//         clearAndRecacheModule(filePath, client);
//         }
//     });

//     console.log(`Watching for changes in command directory: ${fullPath}`);
// }
function watchCommands(directory, client) {
  const fullPath = path.resolve(directory);
  const timers = {}; // Object to store timers for each file

  fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
    if (filename && eventType === "change" && filename.endsWith(".js")) {
      const filePath = path.join(fullPath, filename);
      // console.log(`Detected change in command file: ${filePath}`);

      if (timers[filePath]) {
        clearTimeout(timers[filePath]);
      }

      timers[filePath] = setTimeout(() => {
        console.log(`Detected file change: ${filePath}`);
        // console.log(`Updating file: ${filePath}`);
        clearAndRecacheModule(filePath, client);
        delete timers[filePath];
      }, 300);
    }
  });

  console.log(`Watching for changes in command directory: ${fullPath}`);
}

module.exports = { watchCommands };

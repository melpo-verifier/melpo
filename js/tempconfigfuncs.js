const { TempConfig, Statistics } = require("../dbObjects.js");

async function createTemporarySetup(serverID) {
  const [temporarySetup, created] = await TempConfig.findOrCreate({
    where: { server_id: serverID },
  });
  return { temporarySetup, created };
}

async function updateTemporarySetup(serverID, updates) {
  const { temporarySetup } = await createTemporarySetup(serverID);

  const setupData = temporarySetup.get({ plain: true });

  // Merge the updates with the existing data
  for (const key in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      if (Array.isArray(updates[key])) {
        // If the update is an array, replace the existing array
        setupData[key] = updates[key];
      } else if (typeof updates[key] === "object" && updates[key] !== null) {
        // If the update is an object, merge it with the existing object
        setupData[key] = { ...setupData[key], ...updates[key] };
      } else {
        // Otherwise, directly assign the value
        setupData[key] = updates[key];
      }
    }
  }

  await TempConfig.update(setupData, {
    where: { server_id: serverID },
  });
}

async function deleteTemporarySetup(serverID) {
  await TempConfig.destroy({
    where: { server_id: serverID },
  });
}

async function updateCommandUsage(commandName) {
  const today = new Date().toISOString().split("T")[0];

  await Statistics.sequelize.transaction(async (transaction) => {
    const [statistics] = await Statistics.findOrCreate({
      where: { date: today },
      defaults: { commandUsage: {} },
      transaction,
    });

    const commandUsage = statistics.commandUsage || {};
    commandUsage[commandName] = (commandUsage[commandName] || 0) + 1;
    statistics.commandUsage = commandUsage;
    statistics.changed("commandUsage", true);

    await statistics.save({ transaction });
  });
}

async function updateComponentUsage(componentName) {
  const today = new Date().toISOString().split("T")[0];

  await Statistics.sequelize.transaction(async (transaction) => {
    const [statistics] = await Statistics.findOrCreate({
      where: { date: today },
      defaults: { componentUsage: {} },
      transaction,
    });

    const componentUsage = statistics.componentUsage || {};
    componentUsage[componentName] = (componentUsage[componentName] || 0) + 1;
    statistics.componentUsage = componentUsage;
    statistics.changed("componentUsage", true);

    await statistics.save({ transaction });
  });
}

async function updateVerifications() {
  const today = new Date().toISOString().split("T")[0];
  let stats = await Statistics.findByPk(today);

  if (!stats) {
    stats = await Statistics.create({ date: today });
  }

  stats.verifications += 1;
  await stats.save();
}

async function updateBotJoins() {
  const today = new Date().toISOString().split("T")[0];
  let stats = await Statistics.findByPk(today);

  if (!stats) {
    stats = await Statistics.create({ date: today });
  }

  stats.botJoins += 1;
  await stats.save();
}

async function updateBotLeaves() {
  const today = new Date().toISOString().split("T")[0];
  let stats = await Statistics.findByPk(today);

  if (!stats) {
    stats = await Statistics.create({ date: today });
  }

  stats.botLeaves += 1;
  await stats.save();
}

module.exports = {
  createTemporarySetup,
  updateTemporarySetup,
  deleteTemporarySetup,
  updateCommandUsage,
  updateVerifications,
  updateBotJoins,
  updateBotLeaves,
  updateComponentUsage,
};

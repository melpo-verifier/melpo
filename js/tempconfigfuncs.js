const { TempConfig, Statistics, TempApplication, Application } = require("../dbObjects.js");

async function getApplicationById(applicationId, guildId) {
  if (!applicationId || isNaN(applicationId)) {
    return { application: null, error: "Invalid application ID" };
  }

  const application = await Application.findByPk(applicationId);
  
  if (!application) {
    return { application: null, error: "Application not found" };
  }
  
  if (application.server_id !== guildId) {
    return { application: null, error: "Application does not belong to this server" };
  }
  
  return { application, error: null };
}

async function getTempApplicationById(tempApplicationId, guildId) {
  if (!tempApplicationId || isNaN(tempApplicationId)) {
    return { tempApp: null, error: "Invalid temp application ID" };
  }

  const tempApp = await TempApplication.findByPk(tempApplicationId);
  
  if (!tempApp) {
    return { tempApp: null, error: "Temp application not found" };
  }
  
  if (tempApp.server_id !== guildId) {
    return { tempApp: null, error: "Temp application does not belong to this server" };
  }
  
  return { tempApp, error: null };
}

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
        // Empty arrays are treated as deleting the field (set to null)
        setupData[key] = updates[key].length === 0 ? null : updates[key];
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

async function createTempApplication(serverID, appData = {}) {
  const where = appData.id
    ? { server_id: serverID, id: appData.id }
    : appData.name 
      ? { server_id: serverID, name: appData.name }
      : { server_id: serverID, applicationId: appData.applicationId };

  // Check if TempApplication already exists
  let tempApp = await TempApplication.findOne({ where });
  
  if (tempApp) {
    if (appData.applicationId && tempApp.applicationId !== appData.applicationId) {
      tempApp.applicationId = appData.applicationId;
      await tempApp.save();
    }
    return { tempApp, created: false };
  }

  let defaults = { server_id: serverID, ...appData };
  
  if (appData.applicationId) {
    const existingApp = await Application.findByPk(appData.applicationId);
    if (existingApp) {
      // Copy all relevant fields from the existing Application
      const appFields = existingApp.get({ plain: true });
      // Remove fields that shouldn't be copied (id, timestamps, server_id)
      // eslint-disable-next-line no-unused-vars
      const { id, createdAt, updatedAt, server_id, autorole, ...copyableFields } = appFields;
      
      defaults = {
        server_id: serverID,
        applicationId: appData.applicationId,
        ...copyableFields,
        ...Object.fromEntries(
          Object.entries(appData).filter(([key]) => key !== 'applicationId')
        ),
      };
    }
  }

  tempApp = await TempApplication.create(defaults);
  return { tempApp, created: true };
}

async function updateTempApplication(serverID, updates, appIdentifier) {
  const where = { server_id: serverID, ...appIdentifier };
  
  const existingTempApp = await TempApplication.findOne({ where });
  
  if (!existingTempApp) {
    throw new Error("TempApplication not found for update");
  }

  const existingData = existingTempApp.get({ plain: true });
  const mergedUpdates = {};

  // Merge the updates with the existing data
  for (const key in updates) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      if (Array.isArray(updates[key])) {
        // If the update is an array, replace the existing array
        // Empty arrays are treated as deleting the field (set to null)
        mergedUpdates[key] = updates[key].length === 0 ? [] : updates[key];
      } else if (typeof updates[key] === "object" && updates[key] !== null) {
        // If the update is an object, merge it with the existing object
        const existingValue = existingData[key];
        if (typeof existingValue === "object" && existingValue !== null && !Array.isArray(existingValue)) {
          mergedUpdates[key] = { ...existingValue, ...updates[key] };
        } else {
          mergedUpdates[key] = updates[key];
        }
      } else {
        // Otherwise, directly assign the value
        mergedUpdates[key] = updates[key];
      }
    }
  }

  await TempApplication.update(mergedUpdates, { where: where });
}

async function deleteTempApplication(serverID, appIdentifier) {
  const where = { server_id: serverID, ...appIdentifier };
  await TempApplication.destroy({ where: where });
}

async function getTempApplications(serverID) {
  return await TempApplication.findAll({ where: { server_id: serverID } });
}

async function getDefaultApplication(guildId) {
  if (!guildId) {
    return { application: null, error: "Invalid guild ID" };
  }

  const application = await Application.findOne({
    where: { server_id: guildId, name: "verification" },
    order: [['id', 'ASC']],
  });

  if (!application) {
    return { application: null, error: "No applications found for this server" };
  }

  return { application, error: null };
}

async function getApplicationByIdWithFallback(applicationId, guildId) {
  // Try to get the specific application
  const { application } = await getApplicationById(applicationId, guildId);
  
  if (application) {
    return { application, error: null };
  }

  // Fallback to the default application
  return await getDefaultApplication(guildId);
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
  createTempApplication,
  updateTempApplication,
  deleteTempApplication,
  getTempApplications,
  getApplicationById,
  getTempApplicationById,
  getDefaultApplication,
  getApplicationByIdWithFallback,
};

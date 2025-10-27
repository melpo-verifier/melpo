const {
  createTemporarySetup,
  updateTemporarySetup,
  updateTempApplication,
  createTempApplication,
} = require("../../js/tempconfigfuncs.js");
const miscinfo = require("./miscinfo.js");

module.exports = async ({ interaction, context }) => {
  const threadenabled = context[0] === "true";
  const appName = context[1];

  const { tempApp } = await createTempApplication(interaction.guild.id, { name: appName });

  console.log(
    `Toggling useThreads for guild ${interaction.guild.id}. Current value: ${threadenabled}`,
  );

  if (!tempApp) {
    throw new Error("Failed to fetch or create temporary setup.");
  }

  const newUseThreads = !threadenabled;

  console.log(
    `New useThreads value for guild ${interaction.guild.id}: ${newUseThreads}`,
  );

  await updateTempApplication(interaction.guild.id, {
    usethreads: newUseThreads,
  }, { name: appName });

  await miscinfo({ interaction, appName });
};

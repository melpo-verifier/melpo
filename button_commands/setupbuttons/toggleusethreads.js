const {
  createTemporarySetup,
  updateTemporarySetup,
} = require("../../js/tempconfigfuncs.js");
const miscinfo = require("./miscinfo.js");

module.exports = async ({ interaction, context }) => {
  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);
  console.log(context[0]);
  const threadenabled = context[0] === "true";
  console.log(
    `Toggling useThreads for guild ${interaction.guild.id}. Current value: ${threadenabled}`,
  );

  if (!temporarySetup) {
    throw new Error("Failed to fetch or create temporary setup.");
  }

  const newUseThreads = !threadenabled;

  console.log(
    `New useThreads value for guild ${interaction.guild.id}: ${newUseThreads}`,
  );

  await updateTemporarySetup(interaction.guild.id, {
    usethreads: newUseThreads,
  });

  await miscinfo({ interaction });
};

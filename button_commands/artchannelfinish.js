module.exports = async ({ interaction }) => {
  await interaction.update({
    content: `Great! The setup of the artleaderboard is now completed!`,
    components: [],
  });
};

module.exports = (sequelize, DataTypes) => {
  return sequelize.define("ArtLeaderboard", {
    server_id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    JSON: {
      type: DataTypes.JSONB,
    },
  });
};

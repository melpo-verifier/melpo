module.exports = (sequelize, DataTypes) => {
  return sequelize.define("whitelist", {
    server_id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    artLeaderboard: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  });
};

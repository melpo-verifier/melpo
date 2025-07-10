module.exports = (sequelize, DataTypes) => {
  return sequelize.define("artboardconfig", {
    server_id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    artleaderboardchannel: {
      type: DataTypes.STRING,
    },
    artchannels: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    emoji: {
      type: DataTypes.STRING,
    },
    winnerrole: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
  });
};

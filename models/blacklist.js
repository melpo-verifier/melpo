module.exports = (sequelize, DataTypes) => {
  return sequelize.define("blacklist", {
    server_id: {
      type: DataTypes.STRING,
    },
    user_id: {
      type: DataTypes.STRING,
    },
    blacklisted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });
};

module.exports = (sequelize, DataTypes) => {
  return sequelize.define("opt-out", {
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    optedOut: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });
};

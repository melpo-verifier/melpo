module.exports = (sequelize, DataTypes) => {
  return sequelize.define("verification", {
    userId: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    guildVerifications: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  });
};

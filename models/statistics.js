module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Statistics",
    {
      date: {
        type: DataTypes.DATEONLY,
        defaultValue: sequelize.NOW,
        primaryKey: true,
      },
      commandUsage: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      componentUsage: {
        type: DataTypes.JSONB,
        defaultValue: {},
      },
      verifications: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      botJoins: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      botLeaves: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      timestamps: false,
    },
  );
};

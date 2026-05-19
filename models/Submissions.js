module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "submissions",
    {
      message_id: { type: DataTypes.STRING, primaryKey: true },
      user_id:    { type: DataTypes.STRING, allowNull: false },
      guild_id:   { type: DataTypes.STRING, allowNull: false },
      app_id:     { type: DataTypes.STRING, allowNull: true },
      status:     { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
      data:       { type: DataTypes.TEXT, allowNull: false }
    },
    {
      indexes: [
        { fields: ["user_id"] },
        { fields: ["guild_id"] }
      ]
    }
  );
};

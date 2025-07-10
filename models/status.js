module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Status",
    {
      client_id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: "online",
      },
      type: {
        type: DataTypes.INTEGER,
        defaultValue: 4,
      },
      name: {
        type: DataTypes.STRING,
        defaultValue: "🛠️ Securing your server | /help",
      },
      guilds: {
        type: DataTypes.ARRAY(DataTypes.STRING),
      },
    },
    {
      timestamps: false,
    },
  );
};

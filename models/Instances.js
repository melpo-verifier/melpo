module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "Instances",
    {
      client_id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      owner_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bot_token: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    //   bot_name: {
    //     type: DataTypes.STRING,
    //     allowNull: true,
    //   },
    //   bot_avatar: {
    //     type: DataTypes.STRING,
    //     allowNull: true,
    //   },
      status: {
        type: DataTypes.STRING,
        defaultValue: "online",
      },
      type: {
        type: DataTypes.INTEGER,
        defaultValue: 4,
      },
      status_name: {
        type: DataTypes.STRING,
        defaultValue: "🛠️ Securing your server | /help",
      },
      guilds: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      timestamps: false,
    },
  );
};

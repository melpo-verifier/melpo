module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "premiumsubscription",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      purchaser_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      tier: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      guild_id: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },
      source: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: "ACTIVE",
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      checkout_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      processed_ids: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: [],
      },
    },
    {
      indexes: [
        { fields: ["purchaser_id"] },
        { fields: ["tier"] },
        { fields: ["status"] },
        { fields: ["source"] },
        { fields: ["checkout_id"] },
        { fields: ["guild_id"], using: "gin" },
        { fields: ["processed_ids"], using: "gin" },
      ],
    }
  )
}

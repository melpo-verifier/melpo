module.exports = (sequelize, DataTypes) => {
	return sequelize.define(
		"guildWebhook",
		{
			channel_id: { type: DataTypes.STRING, primaryKey: true },
			guild_id: { type: DataTypes.STRING, allowNull: false },
			encrypted_token: { type: DataTypes.TEXT, allowNull: false },
		},
		{ indexes: [{ fields: ["guild_id"] }] },
	);
};

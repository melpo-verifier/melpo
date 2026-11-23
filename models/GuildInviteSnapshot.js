module.exports = (sequelize, DataTypes) => {
	return sequelize.define(
		"guildInviteSnapshot",
		{
			guild_id: { type: DataTypes.STRING, primaryKey: true },
			invites: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
			vanity_code: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
			vanity_uses: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
		},
		{
			tableName: "guild_invite_snapshots",
			indexes: [{ fields: ["updatedAt"] }],
		},
	);
};

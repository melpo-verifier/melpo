module.exports = (sequelize, DataTypes) => {
	return sequelize.define("serverconfig", {
		server_id: { type: DataTypes.STRING, primaryKey: true },
		autorole: { type: DataTypes.ARRAY(DataTypes.STRING) },
		left_at: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
	});
};

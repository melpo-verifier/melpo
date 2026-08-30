module.exports = (sequelize, DataTypes) => {
	return sequelize.define("pendingActions", {
		guildId: { type: DataTypes.STRING(20), allowNull: false },
		userId: { type: DataTypes.STRING(20), allowNull: false },
		actionType: { type: DataTypes.STRING(40), allowNull: false },
		applicationId: { type: DataTypes.INTEGER, allowNull: true },
		executeAt: { type: DataTypes.DATE, allowNull: false },
	});
};

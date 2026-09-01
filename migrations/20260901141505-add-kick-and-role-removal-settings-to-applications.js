"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		const tableName = "applications";

		await Promise.all([
			queryInterface.addColumn(tableName, "autoRemoveDeniedRoleEnabled", {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
				allowNull: false,
			}),
			queryInterface.addColumn(tableName, "autoRemoveDeniedRoleHours", {
				type: Sequelize.INTEGER,
				defaultValue: 24,
				allowNull: false,
			}),
			queryInterface.addColumn(tableName, "autoKickUnverifiedEnabled", {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
				allowNull: false,
			}),
			queryInterface.addColumn(tableName, "cancelKickOnSubmission", {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
				allowNull: false,
			}),
			queryInterface.addColumn(tableName, "autoKickUnverifiedHours", {
				type: Sequelize.INTEGER,
				defaultValue: 48,
				allowNull: false,
			}),
		]);
	},

	async down(queryInterface, Sequelize) {
		const tableName = "applications";

		await Promise.all([
			queryInterface.removeColumn(tableName, "autoRemoveDeniedRoleEnabled"),
			queryInterface.removeColumn(tableName, "autoRemoveDeniedRoleHours"),
			queryInterface.removeColumn(tableName, "autoKickUnverifiedEnabled"),
			queryInterface.removeColumn(tableName, "cancelKickOnSubmission"),
			queryInterface.removeColumn(tableName, "autoKickUnverifiedHours"),
		]);
	},
};

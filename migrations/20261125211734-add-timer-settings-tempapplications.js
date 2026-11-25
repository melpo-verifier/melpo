/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			const table = "tempapplications";
			const existingColumns = await queryInterface.describeTable(table, { transaction });

			const timerColumns = {
				autoRemoveDeniedRoleEnabled: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: null },
				autoRemoveDeniedRoleHours: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
				resetDeniedThresholdOnRemove: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: null },
				autoKickUnverifiedEnabled: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: null },
				cancelKickOnSubmission: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: null },
				autoKickUnverifiedHours: { type: Sequelize.INTEGER, allowNull: true, defaultValue: null },
			};

			for (const [column, definition] of Object.entries(timerColumns)) {
				if (Object.hasOwn(existingColumns, column)) {
					await queryInterface.changeColumn(table, column, definition, { transaction });
				} else {
					await queryInterface.addColumn(table, column, definition, { transaction });
				}
			}
		});
	},

	async down() {
		// No-op: restoring NOT NULL constraints on nullable staging columns would break /setup create.
	},
};

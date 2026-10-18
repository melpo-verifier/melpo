/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.addColumn(
				"applications",
				"imageSubmission",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: true,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"allowedroles",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"ignoreroles",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"pendingrole",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"deniedremoveroles",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"resetDeniedThresholdOnRemove",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"autoRemoveDeniedRoleEnabled",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"autoRemoveDeniedRoleHours",
				{
					type: Sequelize.INTEGER,
					defaultValue: 24,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"autoKickUnverifiedEnabled",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"autoKickUnverifiedHours",
				{
					type: Sequelize.INTEGER,
					defaultValue: 48,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"applications",
				"cancelKickOnSubmission",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
					allowNull: false,
				},
				{ transaction },
			);

			//tempapplications table
			await queryInterface.addColumn(
				"tempapplications",
				"imageSubmission",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: true,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"allowedroles",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"ignoreroles",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"pendingrole",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"deniedremoveroles",
				{
					type: Sequelize.JSONB,
					defaultValue: [],
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"resetDeniedThresholdOnRemove",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"autoRemoveDeniedRoleEnabled",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"autoRemoveDeniedRoleHours",
				{
					type: Sequelize.INTEGER,
					defaultValue: 24,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"autoKickUnverifiedEnabled",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"autoKickUnverifiedHours",
				{
					type: Sequelize.INTEGER,
					defaultValue: 48,
					allowNull: false,
				},
				{ transaction },
			);
			await queryInterface.addColumn(
				"tempapplications",
				"cancelKickOnSubmission",
				{
					type: Sequelize.BOOLEAN,
					defaultValue: false,
					allowNull: false,
				},
				{ transaction },
			);
		});
	},

	async down(queryInterface) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.removeColumn("applications", "imageSubmission", { transaction });
			await queryInterface.removeColumn("applications", "allowedroles", { transaction });
			await queryInterface.removeColumn("applications", "ignoreroles", { transaction });
			await queryInterface.removeColumn("applications", "pendingrole", { transaction });
			await queryInterface.removeColumn("applications", "deniedremoveroles", { transaction });
			await queryInterface.removeColumn("applications", "resetDeniedThresholdOnRemove", { transaction });
			await queryInterface.removeColumn("applications", "autoRemoveDeniedRoleEnabled", { transaction });
			await queryInterface.removeColumn("applications", "autoRemoveDeniedRoleHours", { transaction });
			await queryInterface.removeColumn("applications", "autoKickUnverifiedEnabled", { transaction });
			await queryInterface.removeColumn("applications", "autoKickUnverifiedHours", { transaction });
			await queryInterface.removeColumn("applications", "cancelKickOnSubmission", { transaction });

			await queryInterface.removeColumn("tempapplications", "imageSubmission", { transaction });
			await queryInterface.removeColumn("tempapplications", "allowedroles", { transaction });
			await queryInterface.removeColumn("tempapplications", "ignoreroles", { transaction });
			await queryInterface.removeColumn("tempapplications", "pendingrole", { transaction });
			await queryInterface.removeColumn("tempapplications", "deniedremoveroles", { transaction });
			await queryInterface.removeColumn("tempapplications", "resetDeniedThresholdOnRemove", { transaction });
			await queryInterface.removeColumn("tempapplications", "autoRemoveDeniedRoleEnabled", { transaction });
			await queryInterface.removeColumn("tempapplications", "autoRemoveDeniedRoleHours", { transaction });
			await queryInterface.removeColumn("tempapplications", "autoKickUnverifiedEnabled", { transaction });
			await queryInterface.removeColumn("tempapplications", "autoKickUnverifiedHours", { transaction });
			await queryInterface.removeColumn("tempapplications", "cancelKickOnSubmission", { transaction });
		});
	},
};

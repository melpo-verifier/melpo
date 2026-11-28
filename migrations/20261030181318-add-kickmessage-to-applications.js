const def_embeds = require("../templates/application_defaults.js");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.addColumn(
				"applications",
				"kickmessage",
				{
					type: Sequelize.JSONB,
					defaultValue: def_embeds.verify_dm_kick,
					allowNull: false,
				},
				{ transaction },
			);

			await queryInterface.addColumn(
				"tempapplications",
				"kickmessage",
				{
					type: Sequelize.JSONB,
				},
				{ transaction },
			);
		});
	},

	async down(queryInterface) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.removeColumn("applications", "kickmessage", { transaction });
			await queryInterface.removeColumn("tempapplications", "kickmessage", { transaction });
		});
	},
};

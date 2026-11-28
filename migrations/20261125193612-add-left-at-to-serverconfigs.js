/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.addColumn(
				"serverconfigs",
				"left_at",
				{
					type: Sequelize.DATE,
					allowNull: true,
					defaultValue: null,
				},
				{ transaction },
			);
		});
	},

	async down(queryInterface) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.removeColumn("serverconfigs", "left_at", { transaction });
		});
	},
};

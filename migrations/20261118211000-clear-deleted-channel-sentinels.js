/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.sequelize.query(
				`UPDATE "applications" SET "verifylogs" = NULL WHERE "verifylogs" IN ('deleted', '')`,
				{ transaction },
			);
			await queryInterface.sequelize.query(
				`UPDATE "applications" SET "verificationwelcomechannel" = NULL WHERE "verificationwelcomechannel" IN ('deleted', '')`,
				{ transaction },
			);
		});
	},

	async down() {
		// No-op: restoring invalid 'deleted' or empty channel sentinels is undesirable.
	},
};

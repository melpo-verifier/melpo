/** @type {import('sequelize-cli').Migration} */
module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.createTable(
				"guild_invite_snapshots",
				{
					guild_id: {
						type: Sequelize.STRING,
						primaryKey: true,
						allowNull: false,
					},
					invites: {
						type: Sequelize.JSONB,
						allowNull: false,
						defaultValue: {},
					},
					vanity_code: {
						type: Sequelize.STRING,
						allowNull: true,
						defaultValue: null,
					},
					vanity_uses: {
						type: Sequelize.INTEGER,
						allowNull: true,
						defaultValue: null,
					},
					createdAt: {
						type: Sequelize.DATE,
						allowNull: false,
					},
					updatedAt: {
						type: Sequelize.DATE,
						allowNull: false,
					},
				},
				{ transaction },
			);

			await queryInterface.addIndex("guild_invite_snapshots", ["updatedAt"], {
				name: "guild_invite_snapshots_updated_at_idx",
				transaction,
			});

			await queryInterface.sequelize.query(`DELETE FROM "invites" WHERE "id" IS NULL`, { transaction });
		});
	},

	async down(queryInterface) {
		await queryInterface.sequelize.transaction(async (transaction) => {
			await queryInterface.dropTable("guild_invite_snapshots", { transaction });
		});
	},
};

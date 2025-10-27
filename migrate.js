// In migrations/20250816-add-applications.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('applications', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      server_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      questions: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      verifyChannel: {
        type: Sequelize.STRING,
      },
      reviewChannel: {
        type: Sequelize.STRING,
      },
      pingRoles: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      verifiedRoles: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      unverifiedRoles: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      startMessage: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      finishMessage: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      verifyChannelEmbed: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      useThreads: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE,
    });

    // Migrate old ServerConfig data to Applications
    const configs = await queryInterface.sequelize.query('SELECT * FROM serverconfigs', { type: Sequelize.QueryTypes.SELECT });
    for (const config of configs) {
      if (config.questions && config.questions.length > 0) {
        await queryInterface.sequelize.query(
          'INSERT INTO applications (server_id, name, questions, verifyChannel, reviewChannel, pingRoles, verifiedRoles, unverifiedRoles, startMessage, finishMessage, verifyChannelEmbed, useThreads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          {
            replacements: [
              config.server_id,
              'verification', // Default app name
              JSON.stringify(config.questions),
              config.verifychannel,
              config.reviewchannel,
              JSON.stringify(config.pingrole || []),
              JSON.stringify(config.verifiedrole || []),
              JSON.stringify(config.unverifiedrole || []),
              JSON.stringify(config.startmessage || {}),
              JSON.stringify(config.finishmessage || {}),
              JSON.stringify(config.verifychannelembed || {}),
              config.usethreads || false,
            ],
          }
        );
      }
    }
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('applications');
  },
};
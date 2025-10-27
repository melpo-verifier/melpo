module.exports = (sequelize, DataTypes) => {
  return sequelize.define("application", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    server_id: {
      type: DataTypes.STRING,
      allowNull: false,
      references: {
        model: 'serverconfigs',
        key: 'server_id',
      },
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    questions: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    verifyChannel: {
      type: DataTypes.STRING,
    },
    reviewChannel: {
      type: DataTypes.STRING,
    },
    verifyLogs: {
      type: DataTypes.STRING,
    },
    verificationWelcomeChannel: {
      type: DataTypes.STRING,
    },
    verifiedRoles: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    managerRoles: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    pingRoles: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    unverifiedRoles: {
      type: DataTypes.JSONB, 
      defaultValue: [],
    },
    verifyFilter: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    verificationWelcomeMessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "Welcome {username}!",
        description: "Hello {usermention}, welcome to **${interaction.guild.name}**!",
        color: "#3f7ff1",
      },
      allowNull: false,
    },
    verifyChannelEmbed: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "How to verify",
        description: `After clicking the "Verify" button below the bot will DM you some questions in order for you to access the server. You'll have to fill out the complete form in order for the moderators to see your application. \n\nClick the "Verify" button below to start verification`,
        color: "#3f7ff1",
      },
      allowNull: false,
    },
    verifyMessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Verification accepted`,
        description: "Your verification for **${interaction.guild.name}** has been accepted by {modname}!",
        color: "#008000",
      },
      allowNull: false,
    },
    startMessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "${interaction.guild.name}'s Verification",
        description: '**Welcome to Melpo\'s verification!**\nWelcome {username} to the verification process of ${interaction.guild.name}! Please answer the following questions within 60 minutes. You can cancel the verification any time by clicking "cancel".',
        color: "#3f7ff1",
      },
      allowNull: false,
    },
    finishMessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Verification Completed`,
        description: "The verification has been completed successfully and has been sent to review to ${interaction.guild.name}!",
        color: "#008000",
      },
      allowNull: false,
    },
    denyMessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Verification Denied`,
        description: "Your verification has been denied by {modname}!",
        color: "#EB2121",
      },
      allowNull: false,
    },
    useThreads: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    indexes: [
      {
        unique: true,
        fields: ['server_id', 'name'], // Composite unique index
      },
    ],
  });
};
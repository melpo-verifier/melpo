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
    verifychannel: {
      type: DataTypes.STRING,
    },
    reviewchannel: {
      type: DataTypes.STRING,
    },
    verifylogs: {
      type: DataTypes.STRING,
    },
    verificationwelcomechannel: {
      type: DataTypes.STRING,
    },
    verifiedrole: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    managerrole: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    pingrole: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    questionpingrole: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    unverifiedrole: {
      type: DataTypes.JSONB, 
      defaultValue: [],
    },
    verifyfilter: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    verificationwelcomemessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "Welcome {username}!",
        description: "Hello {usermention}, welcome to **${interaction.guild.name}**!",
        color: "#3f7ff1",
      },
      allowNull: false,
    },
    verifychannelembed: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "How to verify",
        description: `After clicking the "Apply" button below the bot will DM you some questions in order for you to access the server. You'll have to fill out the complete form in order for the moderators to see your application. \n\nClick the "Apply" button below to start the application`,
        color: "#3f7ff1",
      },
      allowNull: false,
    },
    verifymessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Application accepted`,
        description: "Your application for **{appName}** in **${interaction.guild.name}** has been accepted by {modname}!",
        color: "#008000",
      },
      allowNull: false,
    },
    startmessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "${interaction.guild.name}'s Verification",
        description: '**Welcome to Melpo\'s verification!**\nWelcome {username} to the verification process of ${interaction.guild.name}! Please answer the following questions within 60 minutes. You can cancel the verification any time by clicking "cancel".',
        color: "#3f7ff1",
      },
      allowNull: false,
    },
    finishmessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Application Completed`,
        description: "Your application has been completed successfully and has been sent to review to ${interaction.guild.name}!",
        color: "#008000",
      },
      allowNull: false,
    },
    denymessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Application Denied`,
        description: "Your application for **{appName}** in **${interaction.guild.name}** has been denied by {modname}!",
        color: "#EB2121",
      },
      allowNull: false,
    },
    usethreads: {
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
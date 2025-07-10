module.exports = (sequelize, DataTypes) => {
  return sequelize.define("serverconfig", {
    server_id: {
      type: DataTypes.STRING,
      primaryKey: true,
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
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    questions: {
      type: DataTypes.ARRAY(DataTypes.STRING(4096)),
    },
    managerrole: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    pingrole: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    autorole: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    unverifiedrole: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    verifyfilter: {
      type: DataTypes.ARRAY(DataTypes.STRING),
    },
    verificationwelcomemessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "Welcome {username}!",
        description:
          "Hello {usermention}, welcome to **${interaction.guild.name}**!",
        color: "#3f7ff1",
        // image: null
      },
      allowNull: false,
    },
    verifychannelembed: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "How to verify",
        description: `After clicking the "Verify" button below the bot will DM you some questions in order for you to access the server. You'll have to fill out the complete form in order for the moderators to see your application. \n\nClick the "Verify" button below to start verification`,
        color: "#3f7ff1",
        // image: null
      },
      allowNull: false,
    },
    verifymessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Verification accepted`,
        description:
          "Your verification for **${interaction.guild.name}** has been accepted by {modname}!",
        color: "#008000",
        // image: null
      },
      allowNull: false,
    },
    startmessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: "${interaction.guild.name}'s Verification",
        description:
          '**Welcome to Melpo\'s verification!**\nWelcome {username} to the verification process of ${interaction.guild.name}! Please answer the following questions within 60 minutes. You can cancel the verification any time by clicking "cancel".',
        color: "#3f7ff1",
        // image: null
      },
      allowNull: false,
    },
    finishmessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Verification Completed`,
        description:
          "The verification has been completed successfully and has been sent to review to ${interaction.guild.name}!",
        color: "#008000",
        // image: null
      },
      allowNull: false,
    },
    denymessage: {
      type: DataTypes.JSONB,
      defaultValue: {
        title: `Verification Denied`,
        description: "Your verification has been denied by {modname}!",
        color: "#EB2121",
        // image: null
      },
      allowNull: false,
    },
    usethreads: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  });
};

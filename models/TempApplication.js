module.exports = (sequelize, DataTypes) => {
  return sequelize.define("tempapplication", {
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
    },
    verifyChannelEmbed: {
      type: DataTypes.JSONB,
    },
    verifyMessage: {
      type: DataTypes.JSONB,
    },
    startMessage: {
      type: DataTypes.JSONB,
    },
    finishMessage: {
      type: DataTypes.JSONB,
    },
    denyMessage: {
      type: DataTypes.JSONB,
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
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
    },
    verifychannelembed: {
      type: DataTypes.JSONB,
    },
    verifymessage: {
      type: DataTypes.JSONB,
    },
    startmessage: {
      type: DataTypes.JSONB,
    },
    finishmessage: {
      type: DataTypes.JSONB,
    },
    denymessage: {
      type: DataTypes.JSONB,
    },
    usethreads: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    indexes: [
      {
        unique: true,
        fields: ['server_id', 'name'],
      },
    ],
  });
};
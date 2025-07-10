module.exports = (sequelize, DataTypes) => {
  return sequelize.define("tempconfig", {
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
      type: DataTypes.ARRAY(DataTypes.STRING(1024)),
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
    },
  });
};

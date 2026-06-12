module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "tempapplication", 
    {
      id:                         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      server_id:                  { type: DataTypes.STRING, allowNull: false, references: { model: 'serverconfigs', key: 'server_id' } },
      applicationId:              { type: DataTypes.INTEGER, allowNull: true, references: { model: 'applications', key: 'id' } },
      custom_name:                { type: DataTypes.STRING, allowNull: true },
      custom_avatar_url:          { type: DataTypes.TEXT, allowNull: true },
      branding_enabled:           { type: DataTypes.BOOLEAN, defaultValue: false },
      name:                       { type: DataTypes.STRING, allowNull: false },
      questions:                  { type: DataTypes.JSONB, defaultValue: [] },
      verifychannel:              { type: DataTypes.STRING },
      reviewchannel:              { type: DataTypes.STRING },
      verifylogs:                 { type: DataTypes.STRING },
      verificationwelcomechannel: { type: DataTypes.STRING },
      verifiedrole:               { type: DataTypes.JSONB, defaultValue: [] },
      managerrole:                { type: DataTypes.JSONB, defaultValue: [] },
      deniedrole:                 { type: DataTypes.JSONB, defaultValue: [] },
      maxdenials:                 { type: DataTypes.INTEGER, defaultValue: null, allowNull: true },
      verifymessage_id:           { type: DataTypes.STRING },
      pingrole:                   { type: DataTypes.JSONB, defaultValue: [] },
      questionpingrole:           { type: DataTypes.JSONB, defaultValue: [] },
      unverifiedrole:             { type: DataTypes.JSONB, defaultValue: [] },
      verifyfilter:               { type: DataTypes.JSONB, defaultValue: [] },
      mainMessageApplicationId:   { type: DataTypes.INTEGER, defaultValue: null, allowNull: true },
      verificationwelcomemessage: { type: DataTypes.JSONB },
      verifychannelembed:         { type: DataTypes.JSONB },
      verifymessage:              { type: DataTypes.JSONB },
      startmessage:               { type: DataTypes.JSONB },
      finishmessage:              { type: DataTypes.JSONB },
      denymessage:                { type: DataTypes.JSONB },
      usethreads:                 { type: DataTypes.BOOLEAN, defaultValue: null, allowNull: true }
    }, 
    {
      indexes: [
        { unique: true, fields: ['server_id', 'name'] },
        { unique: true, fields: ['server_id', 'applicationId'] }
      ]
    }
  );
};
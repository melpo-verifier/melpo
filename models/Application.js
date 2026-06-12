//--Default embeds--
var def_embeds=require("../templates/application_defaults.js");

//--Application DB export--
module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "application", 
    {
      id:                         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      server_id:                  { type: DataTypes.STRING, allowNull: false, references: { model: 'serverconfigs', key: 'server_id' } },
      name:                       { type: DataTypes.STRING, allowNull: false },
      custom_name:                { type: DataTypes.STRING, allowNull: true },
      custom_avatar_url:          { type: DataTypes.TEXT, allowNull: true },
      branding_enabled:           { type: DataTypes.BOOLEAN, defaultValue: false },
      questions:                  { type: DataTypes.JSONB, defaultValue: [] },
      verifychannel:              { type: DataTypes.STRING },
      reviewchannel:              { type: DataTypes.STRING },
      verifylogs:                 { type: DataTypes.STRING },
      verificationwelcomechannel: { type: DataTypes.STRING },
      verifiedrole:               { type: DataTypes.JSONB, defaultValue: [] },
      managerrole:                { type: DataTypes.JSONB, defaultValue: [] },
      deniedrole:                 { type: DataTypes.JSONB, defaultValue: [] },
      maxdenials:                 { type: DataTypes.INTEGER, defaultValue: null, allowNull: true },
      pingrole:                   { type: DataTypes.JSONB, defaultValue: [] },
      questionpingrole:           { type: DataTypes.JSONB, defaultValue: [] },
      unverifiedrole:             { type: DataTypes.JSONB, defaultValue: [] },
      verifymessage_id:           { type: DataTypes.STRING },
      verifyfilter:               { type: DataTypes.JSONB, defaultValue: [] },
      mainMessageApplicationId:   { type: DataTypes.INTEGER, defaultValue: null, allowNull: true },
      verificationwelcomemessage: { type: DataTypes.JSONB, defaultValue: def_embeds.welcome, allowNull: false },
      verifychannelembed:         { type: DataTypes.JSONB, defaultValue: def_embeds.verify_sv_channel, allowNull: false },
      verifymessage:              { type: DataTypes.JSONB, defaultValue: def_embeds.verify_dm_accepted, allowNull: false },
      startmessage:               { type: DataTypes.JSONB, defaultValue: def_embeds.verify_dm_start, allowNull: false },
      finishmessage:              { type: DataTypes.JSONB, defaultValue: def_embeds.verify_dm_finish, allowNull: false },
      denymessage:                { type: DataTypes.JSONB, defaultValue: def_embeds.verify_dm_deny, allowNull: false },
      usethreads:                 { type: DataTypes.BOOLEAN, defaultValue: false }
    }, 
    {
      indexes: [
        {
          unique: true,
          fields: ['server_id', 'name'] // Composite unique index
        },
      ],
    }
  );
};
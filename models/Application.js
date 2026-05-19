//--Default embeds--
const def_embeds = {
  welcome:{ 
    title: "Welcome {username}!", 
    description: "Hello {usermention}, welcome to **${interaction.guild.name}**!", 
    color: "#3f7ff1" 
  },
  verify_sv_channel:{ 
    title: "How to verify", 
    description: `After clicking the "Apply" button below the bot will DM you some questions in order for you to access the server. You'll have to fill out the complete form in order for the moderators to see your application. \n\nClick the "Apply" button below to start the application`, 
    color: "#3f7ff1" 
  },
  verify_dm_accepted:{ 
    title: `Application accepted`, 
    description: "Your application for **{appName}** in **${interaction.guild.name}** has been accepted by {modname}!", 
    color: "#008000" 
  },
  verify_dm_deny:{ 
    title: `Application Denied`, 
    description: "Your application for **{appName}** in **${interaction.guild.name}** has been denied by {modname}!", 
    color: "#EB2121" 
  },
  verify_dm_start:{ 
    title: "${interaction.guild.name}'s Verification", 
    description: '**Welcome to Melpo\'s verification!**\nWelcome {username} to the verification process of ${interaction.guild.name}! Please answer the following questions within 60 minutes. You can cancel the verification any time by clicking "cancel".', 
    color: "#3f7ff1" 
  },
  verify_dm_finish:{
    title: `Application Completed`, 
    description: "Your application has been completed successfully and has been sent to review to ${interaction.guild.name}!", 
    color: "#008000" 
  }
};

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
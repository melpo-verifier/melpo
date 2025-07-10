module.exports = (sequelize, DataTypes) => {
  return sequelize.define("questionid", {
    interactionMessageId: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    verificationMessageId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    channelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });
};

module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    "adtexts", 
    {
      name: { type: DataTypes.STRING },
      type: { type: DataTypes.STRING },
      text: { type: DataTypes.STRING }
    }
  );
}
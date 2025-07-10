module.exports = (sequelize, DataTypes) => {
  return sequelize.define("invite", {
    unique_id: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    id: {
      type: DataTypes.STRING,
    },
    code: {
      type: DataTypes.STRING,
    },
    uses: {
      type: DataTypes.INTEGER,
    },
  });
};

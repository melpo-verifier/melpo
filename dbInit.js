const Sequelize = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    dialect: "postgres",
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    logging: false,
  },
);

require("./models/ServerConfig.js")(sequelize, Sequelize.DataTypes);
require("./models/invitetracker.js")(sequelize, Sequelize.DataTypes);
require("./models/Verification.js")(sequelize, Sequelize.DataTypes);
require("./models/questionid.js")(sequelize, Sequelize.DataTypes);
require("./models/opt-out.js")(sequelize, Sequelize.DataTypes);
require("./models/TempConfig.js")(sequelize, Sequelize.DataTypes);
require("./models/statistics.js")(sequelize, Sequelize.DataTypes);
require("./models/status.js")(sequelize, Sequelize.DataTypes);
require("./models/ArtBoardConfig.js")(sequelize, Sequelize.DataTypes);
require("./models/ArtLeaderboard.js")(sequelize, Sequelize.DataTypes);
require("./models/whitelist.js")(sequelize, Sequelize.DataTypes);

const force = process.argv.includes("--force") || process.argv.includes("-f");

sequelize
  .sync({ force })
  .then(async () => {
    console.log("Database synced");
    sequelize.close();
  })
  .catch(console.error);

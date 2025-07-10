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

const ServerConfig = require("./models/ServerConfig.js")(
  sequelize,
  Sequelize.DataTypes,
);
const InviteTracker = require("./models/invitetracker.js")(
  sequelize,
  Sequelize.DataTypes,
);
const Verification = require("./models/Verification.js")(
  sequelize,
  Sequelize.DataTypes,
);
const QuestionId = require("./models/questionid.js")(
  sequelize,
  Sequelize.DataTypes,
);
const OptOut = require("./models/opt-out.js")(sequelize, Sequelize.DataTypes);
const TempConfig = require("./models/TempConfig.js")(
  sequelize,
  Sequelize.DataTypes,
);
const Statistics = require("./models/statistics.js")(
  sequelize,
  Sequelize.DataTypes,
);
const Status = require("./models/status.js")(sequelize, Sequelize.DataTypes);
const ArtBoardConfig = require("./models/ArtBoardConfig.js")(
  sequelize,
  Sequelize.DataTypes,
);
const ArtLeaderboard = require("./models/ArtLeaderboard.js")(
  sequelize,
  Sequelize.DataTypes,
);
const Whitelist = require("./models/whitelist.js")(
  sequelize,
  Sequelize.DataTypes,
);

module.exports = {
  sequelize,
  ServerConfig,
  InviteTracker,
  Verification,
  QuestionId,
  OptOut,
  TempConfig,
  Statistics,
  Status,
  ArtBoardConfig,
  ArtLeaderboard,
  Whitelist,
};

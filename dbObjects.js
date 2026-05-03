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
const Instances = require("./models/Instances.js")(
  sequelize, 
  Sequelize.DataTypes
);
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
const Application = require("./models/Application.js")(
  sequelize, 
  Sequelize.DataTypes
);
const TempApplication = require("./models/TempApplication.js")(
  sequelize, 
  Sequelize.DataTypes
);
const AdTexts = require("./models/adtexts.js")(
  sequelize, 
  Sequelize.DataTypes
);
const UserBilling = require("./models/UserBilling.js")(
  sequelize, 
  Sequelize.DataTypes
);
const Blacklist = require("./models/blacklist.js")(
  sequelize, 
  Sequelize.DataTypes
);
const Submissions = require("./models/Submissions.js")(
  sequelize,
  Sequelize.DataTypes,
);
const GuildWebhook = require("./models/GuildWebhook.js")(
  sequelize,
  Sequelize.DataTypes,
);


ServerConfig.hasMany(Application, { foreignKey: 'server_id', onDelete: 'CASCADE' });
Application.belongsTo(ServerConfig, { foreignKey: 'server_id' });

module.exports = {
  sequelize,
  ServerConfig,
  InviteTracker,
  Verification,
  QuestionId,
  OptOut,
  TempConfig,
  Statistics,
  Instances,
  ArtBoardConfig,
  ArtLeaderboard,
  Whitelist,
  Application,
  TempApplication,
  AdTexts,
  UserBilling,
  Blacklist,
  Submissions,
  GuildWebhook,
};

const Sequelize = require("sequelize");
require("./util/env_manager.js").config(); //Attempt to read .env if we need to.

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
	dialect: "postgres",
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	logging: false,
});

require("./models/ServerConfig.js")(sequelize, Sequelize.DataTypes);
require("./models/invitetracker.js")(sequelize, Sequelize.DataTypes);
require("./models/Verification.js")(sequelize, Sequelize.DataTypes);
require("./models/questionid.js")(sequelize, Sequelize.DataTypes);
require("./models/opt-out.js")(sequelize, Sequelize.DataTypes);
require("./models/TempConfig.js")(sequelize, Sequelize.DataTypes);
require("./models/statistics.js")(sequelize, Sequelize.DataTypes);
require("./models/Instances.js")(sequelize, Sequelize.DataTypes);
require("./models/Application.js")(sequelize, Sequelize.DataTypes);
require("./models/TempApplication.js")(sequelize, Sequelize.DataTypes);
require("./models/adtexts.js")(sequelize, Sequelize.DataTypes);
require("./models/UserBilling.js")(sequelize, Sequelize.DataTypes);
require("./models/blacklist.js")(sequelize, Sequelize.DataTypes);
require("./models/Submissions.js")(sequelize, Sequelize.DataTypes);
require("./models/PremiumSubscription.js")(sequelize, Sequelize.DataTypes);
require("./models/GuildWebhook.js")(sequelize, Sequelize.DataTypes);

const force = process.argv.includes("--force") || process.argv.includes("-f");
const alter = process.argv.includes("--alter") || process.argv.includes("-a");

sequelize
	.sync({ force, alter })
	.then(async () => {
		console.log("Database synced");
		sequelize.close();
	})
	.catch(console.error);

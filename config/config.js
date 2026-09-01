require("../util/env_manager").config();

const dbConfig = {
	username: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	dialect: "postgres",
};

module.exports = {
	development: dbConfig,
	production: dbConfig,
	test: dbConfig,
};

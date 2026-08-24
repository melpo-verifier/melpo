const { sequelize, ServerConfig, Application } = require("../dbObjects");

//--Default embeds--
var def_embeds = require("../templates/application_defaults.js");

async function main() {
	try {
		const oldConfigs = await sequelize.query(`SELECT * FROM serverconfigs`, { type: sequelize.QueryTypes.SELECT });

		console.log(`Found ${oldConfigs.length} server configurations to migrate.\n`);

		console.log("Migrating data");
		let successCount = 0;
		let errorCount = 0;
		const errors = [];

		for (const oldConfig of oldConfigs) {
			try {
				const serverId = oldConfig.server_id;

				// Check if server already has a ServerConfig
				let serverConfig = await ServerConfig.findOne({ where: { server_id: serverId } });

				if (!serverConfig) {
					serverConfig = await ServerConfig.create({
						server_id: serverId,
						autorole: oldConfig.autorole || [],
					});
				}

				// Check if "verification" application already exists for this server
				const existingApp = await Application.findOne({ where: { server_id: serverId, name: "verification" } });

				if (!existingApp) {
					const applicationData = {
						server_id: serverId,
						name: "verification",
						questions: oldConfig.questions || [],
						verifychannel: oldConfig.verifychannel,
						reviewchannel: oldConfig.reviewchannel,
						verifylogs: oldConfig.verifylogs,
						verificationwelcomechannel: oldConfig.verificationwelcomechannel,
						verifiedrole: oldConfig.verifiedrole || [],
						managerrole: oldConfig.managerrole || [],
						pingrole: oldConfig.pingrole || [],
						unverifiedrole: oldConfig.unverifiedrole || [],
						verifyfilter: oldConfig.verifyfilter || [],
						verificationwelcomemessage: oldConfig.verificationwelcomemessage || def_embeds.welcome,
						verifychannelembed: oldConfig.verifychannelembed || def_embeds.verify_sv_channel,
						verifymessage: oldConfig.verifymessage || def_embeds.verify_dm_accepted,
						startmessage: oldConfig.startmessage || def_embeds.verify_dm_start,
						finishmessage: oldConfig.finishmessage || def_embeds.verify_dm_finish,
						denymessage: oldConfig.denymessage || def_embeds.verify_dm_deny,
						usethreads: oldConfig.usethreads || false,
					};

					await Application.create(applicationData);
				} else {
					console.log(`⚠️ Application "verification" already exists for server ${serverId}`);
				}

				console.log(`Server ${serverId}: ServerConfig + Application created`);
				successCount++;
			} catch (error) {
				console.error(`❌ Error migrating server ${oldConfig.server_id}: ${error.message}`);
				errorCount++;
				errors.push({ serverId: oldConfig.server_id, error: error.message });
			}
		}

		console.log(`Successful: ${successCount}/${oldConfigs.length}\nFailed: ${errorCount}/${oldConfigs.length}\n`);

		if (errors.length > 0) {
			console.log(`❗Errors encountered:`);
			errors.forEach((err) => void console.log(`- Server ${err.serverId}: ${err.error}`));
		}

		const verifyCount = await Application.count({ where: { name: "verification" } });
		console.log(`Applications with name "verification": ${verifyCount}`);

		const serverCount = await ServerConfig.count();
		console.log(`Total ServerConfig entries: ${serverCount}`);

		const appCount = await Application.count();
		console.log(`Total Application entries: ${appCount}\n`);
	} catch (error) {
		console.error("Fatal error during migration:", error);
		process.exit(1);
	} finally {
		await sequelize.close();
	}
}

main().catch(() => {});

const { sequelize, ServerConfig, Application } = require("../dbObjects");

async function main() {
  try {
    const oldConfigs = await sequelize.query(
      `SELECT * FROM serverconfigs`,
      { type: sequelize.QueryTypes.SELECT }
    );

    console.log(`Found ${oldConfigs.length} server configurations to migrate.\n`);

    console.log("Migrating data");
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const oldConfig of oldConfigs) {
      try {
        const serverId = oldConfig.server_id;

        // Check if server already has a ServerConfig
        let serverConfig = await ServerConfig.findOne({
          where: { server_id: serverId },
        });

        if (!serverConfig) {
          serverConfig = await ServerConfig.create({
            server_id: serverId,
            autorole: oldConfig.autorole || [],
          });
        }

        // Check if "verification" application already exists for this server
        let existingApp = await Application.findOne({
          where: { server_id: serverId, name: "verification" },
        });

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
            verificationwelcomemessage: oldConfig.verificationwelcomemessage || {
              title: "Welcome {username}!",
              description:
                "Hello {usermention}, welcome to **${interaction.guild.name}**!",
              color: "#3f7ff1",
            },
            verifychannelembed: oldConfig.verifychannelembed || {
              title: "How to verify",
              description: `After clicking the "Verify" button below the bot will DM you some questions in order for you to access the server. You'll have to fill out the complete form in order for the moderators to see your application. \n\nClick the "Apply" button below to start verification`,
              color: "#3f7ff1",
            },
            verifymessage: oldConfig.verifymessage || {
              title: "Verification accepted",
              description:
                "Your verification for **${interaction.guild.name}** has been accepted by {modname}!",
              color: "#008000",
            },
            startmessage: oldConfig.startmessage || {
              title: "${interaction.guild.name}'s Verification",
              description:
                '**Welcome to Melpo\'s verification!**\nWelcome {username} to the verification process of ${interaction.guild.name}! Please answer the following questions within 60 minutes. You can cancel the verification any time by clicking "cancel".',
              color: "#3f7ff1",
            },
            finishmessage: oldConfig.finishmessage || {
              title: "Verification Completed",
              description:
                "The verification has been completed successfully and has been sent to review to ${interaction.guild.name}!",
              color: "#008000",
            },
            denymessage: oldConfig.denymessage || {
              title: "Verification Denied",
              description: "Your verification has been denied by {modname}!",
              color: "#EB2121",
            },
            usethreads: oldConfig.usethreads || false,
          };

          await Application.create(applicationData);
        } else {
          console.log(
            `⚠️ Application "verification" already exists for server ${serverId}`
          );
        }

        console.log(
          `Server ${serverId}: ServerConfig + Application created`
        );
        successCount++;
      } catch (error) {
        console.error(
          `❌ Error migrating server ${oldConfig.server_id}: ${error.message}`
        );
        errorCount++;
        errors.push({
          serverId: oldConfig.server_id,
          error: error.message,
        });
      }
    }

    console.log(`Successful: ${successCount}/${oldConfigs.length}\nFailed: ${errorCount}/${oldConfigs.length}\n`);

    if (errors.length > 0) {
      console.log(`❗Errors encountered:`);
      errors.forEach((err) => {
        console.log(`- Server ${err.serverId}: ${err.error}`);
      });
    }

    const verifyCount = await Application.count({
      where: { name: "verification" },
    });
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

main();

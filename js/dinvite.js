const { Events } = require("discord.js");
const { Collection } = require("@discordjs/collection");
const { InviteTracker } = require("../dbObjects.js");

module.exports = class InviteManager {
  constructor(client) {
    if (!client) throw new Error("InviteTracker: client is not defined!");
    if (client.guilds.size <= 0)
      return console.error(
        "InviteTracker: client is not connected to any guilds!",
      );

    client.invites = new Collection();

    function hasInvitePermission(guild) {
      const hasPermission = guild.members.me?.permissions.has("ManageGuild");
      if (!hasPermission) {
        console.log(
          `Missing ManageGuild permission in guild: ${guild.name} (${guild.id})`,
        );
      }
      return hasPermission;
    }

    client.on(Events.ClientReady, async () => {
      console.log("Starting to load invites...");
      const allGuilds = Array.from(client.guilds.cache.values());
      const batchSize = 5;
      const delay = 2000;

      // Filter guilds where bot has ManageGuild permission
      const guilds = allGuilds.filter(hasInvitePermission);

      for (let i = 0; i < guilds.length; i += batchSize) {
        const batch = guilds.slice(i, i + batchSize);
        console.log(
          `Processing batch ${i / batchSize + 1}/${Math.ceil(guilds.length / batchSize)}`,
        );

        await Promise.all(
          batch.map(async (guild) => {
            try {
              const collect = new Collection();
              const guildInvites = await guild.invites.fetch().catch((err) => {
                console.error(
                  `Failed to fetch invites for guild ${guild.id}:`,
                  err,
                );
                return null;
              });

              if (guildInvites) {
                guildInvites.forEach((x) => {
                  collect.set(x.code, {
                    uses: x.uses,
                    inviter: x.inviter,
                    code: x.code,
                    guildID: guild.id,
                  });
                });
                client.invites.set(guild.id, collect);
              }
            } catch (error) {
              console.error(`Error processing guild ${guild.id}:`, error);
            }
          }),
        );

        if (i + batchSize < guilds.length) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      console.log("Finished loading all invites!");
    });

    client.on("inviteCreate", async (invite) => {
      if (!hasInvitePermission(invite.guild)) return;

      const invitesData = new Collection();
      invite.guild.invites.fetch().then((bes) => {
        bes.forEach((x) => {
          invitesData.set(x.code, {
            uses: x.uses,
            inviter: x.inviter,
            code: x.code,
          });
        });
        client.invites.set(invite.guild.id, invitesData);
      });
    });

    client.on("inviteDelete", async (invite) => {
      if (!hasInvitePermission(invite.guild)) return;

      const invitesData = new Collection();
      invite.guild.invites.fetch().then((bes) => {
        bes?.map((x) => {
          invitesData.set(x.code, {
            uses: x.uses,
            inviter: x.inviter,
            code: x.code,
          });
        });
        client.invites.set(invite.guild.id, invitesData);
      });
    });

    client.on("guildMemberAdd", async (member) => {
      if (!hasInvitePermission(member.guild)) return;

      const fetchInvites =
        client.invites.get(member.guild.id) || new Collection();
      const invitesData = await member.guild.invites.fetch();
      const invite =
        invitesData.find(
          (bes) =>
            fetchInvites.has(bes.code) &&
            fetchInvites.get(bes.code).uses < bes.uses,
        ) || member.guild.vanityURLCode;

      const hasVanityFeature = member.guild.features.includes("VANITY_URL");
      let vanityURL = null;

      if (hasVanityFeature && member.guild.vanityURLCode) {
        try {
          vanityURL = await member.guild.fetchVanityData();
        } catch {
          vanityURL = null;
        }
      }

      let collect = new Collection();
      invitesData.forEach((x) => {
        collect.set(x.code, {
          uses: x.uses,
          inviter: x.inviter,
          code: x.code,
          guildID: member.guild.id,
        });
      });
      client.invites.set(member.guild.id, collect);

      try {
        // if (invite == null || invite == undefined || !invite) {
        //     // client.emit("memberJoin", member, null, null)
        // } else {
        if (invite !== null && invite !== undefined && invite) {
          const [Tracker] = await InviteTracker.findOrCreate({
            where: { unique_id: `${member.user.id}_${member.guild.id}` },
          });

          if (invite == member.guild.vanityURLCode && hasVanityFeature === true) {
            // client.emit("memberJoin", member, member.guild.vanityURLCode, vanityURL)
            Tracker.id = "vanity";
            Tracker.code = member.guild.vanityURLCode;
            Tracker.uses = vanityURL?.uses ?? null;
          } else if (invite.inviter.id == member.user.id) {
            // client.emit("memberJoin", member, member, invite)
            Tracker.id = member.id;
            Tracker.code = invite.code;
            Tracker.uses = invite.uses;
          } else {
            // let inviter;
            // try {
            //     inviter = await client.users.fetch(invite.inviter.id)
            // }
            // catch {
            //     inviter = undefined
            // }
            // client.emit("memberJoin", member, inviter, invite)
            Tracker.id = invite.inviter.id;
            Tracker.code = invite.code;
            Tracker.uses = invite.uses;
          }

          await Tracker.save();
        }
        if (!invite) {
          console.warn(`No invite found for member ${member.user.tag} (${member.id})`);
          return;
        }
      } catch (error) {
        console.error(
          `An error occurred at processing memberJoin event in dinvite: ${error}`,
        );
      }
    });
    client.on("guildMemberRemove", async (member) => {
      // Delete the tracker data from the InviteTracker table if the user leaves again
      try {
        await InviteTracker.destroy({
          where: { unique_id: `${member.user.id}_${member.guild.id}` },
        });
        console.log(
          `Tracker data for user ${member.id} deleted from the InviteTracker table.`,
        );
      } catch (error) {
        console.error(
          `Failed to delete tracker data for user ${member.id} from the InviteTracker table: ${error}`,
        );
      }
    });
  }
};

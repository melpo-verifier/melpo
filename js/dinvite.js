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

    const vanityCache = {};
    const activeVanityFetches = {};
    const activeInviteFetches = {};
    const cache_TTL = 5 * 60 * 1000;

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

      let guildInvites = client.invites.get(invite.guild.id);
      if (!guildInvites) {
        guildInvites = new Collection();
        client.invites.set(invite.guild.id, guildInvites);
      }
      
      guildInvites.set(invite.code, {
        uses: invite.uses,
        inviter: invite.inviter,
        code: invite.code,
        guildID: invite.guild.id,
      });
    });

    client.on("inviteDelete", async (invite) => {
      if (!hasInvitePermission(invite.guild)) return;

      const guildInvites = client.invites.get(invite.guild.id);
      if (guildInvites) {
        guildInvites.delete(invite.code);
      }
    });

    client.on("guildDelete", (guild) => {
      delete vanityCache[guild.id];
      delete activeVanityFetches[guild.id];
      delete activeInviteFetches[guild.id];
      client.invites.delete(guild.id);
    });

    client.on("guildCreate", async (guild) => {
      if (!hasInvitePermission(guild)) return;
      try {
        const collect = new Collection();
        const guildInvites = await guild.invites.fetch().catch((err) => {
          console.error(`Failed to fetch invites for guild ${guild.id}:`, err);
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
        console.error(`Error processing guildCreate for guild ${guild.id}:`, error);
      }
    });

    client.on("guildMemberAdd", async (member) => {
      // Validate member object
      if (!member || !member.user || !member.guild) {
        console.warn("Invalid member object in guildMemberAdd event");
        return;
      }

      if (!hasInvitePermission(member.guild)) return;

      const fetchInvites =
        client.invites.get(member.guild.id) || new Collection();
      
      if (!activeInviteFetches[member.guild.id]) {
        activeInviteFetches[member.guild.id] = member.guild.invites.fetch().catch(() => new Collection()).finally(() => {
          delete activeInviteFetches[member.guild.id];
        });
      }

      const invitesData = await activeInviteFetches[member.guild.id];

      const invite = invitesData?.find(
        (bes) =>
          fetchInvites.has(bes.code) &&
          fetchInvites.get(bes.code).uses < bes.uses,
      );

      const hasVanityFeature = member.guild.features.includes("VANITY_URL");
      let usedVanity = false;
      let vanityURL = null;

      if (!invite && hasVanityFeature && member.guild.vanityURLCode) {
        usedVanity = true;
        try {
          vanityURL = await getVanityURL(member.guild);
        } catch {
          vanityURL = null;
        }
      }

      let collect = new Collection();
      invitesData?.forEach((x) => {
        collect.set(x.code, {
          uses: x.uses,
          inviter: x.inviter,
          code: x.code,
          guildID: member.guild.id,
        });
      });
      client.invites.set(member.guild.id, collect);

      try {
        // Skip bots
        if (member.user.bot) {
          return;
        }

        const [Tracker] = await InviteTracker.findOrCreate({
          where: { unique_id: `${member.user.id}_${member.guild.id}` },
        });

        if (usedVanity) {
          // Vanity URL invite
          Tracker.id = "vanity";
          Tracker.code = member.guild.vanityURLCode;
          Tracker.uses = vanityURL?.uses ?? null;
        } else if (invite) {
          if (!invite.inviter) {
            console.warn(`Invite found but inviter is null on guild ${member.guild.id}, invite code: ${invite?.code} ${invite?.uses}`);
            return;
          } else {
            // Normal invite
            Tracker.id = invite.inviter.id;
            Tracker.code = invite.code;
            Tracker.uses = invite.uses;
          }
        } else {
          // Unknown invite
          return;
        }

        await Tracker.save();
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
    
    async function getVanityURL(guild) {
      const now = Date.now();
      const cache = vanityCache[guild.id];

      if (cache && now - cache.timestamp < cache_TTL) {
        return Promise.resolve(cache.data);
      }

      if (activeVanityFetches[guild.id]) {
        return activeVanityFetches[guild.id];
      }

      const fetchPromise = guild.fetchVanityData().then((vanityData) => {
        vanityCache[guild.id] = { data: vanityData, timestamp: Date.now() };
        delete activeVanityFetches[guild.id];
        return vanityData;
      }).catch(() => {
        vanityCache[guild.id] = { data: null, timestamp: Date.now() };
        delete activeVanityFetches[guild.id];
        return null;
      });

      activeVanityFetches[guild.id] = fetchPromise;
      return fetchPromise;
    }
  }
};

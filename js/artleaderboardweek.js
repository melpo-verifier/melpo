// Not optimised at all, works, but a lot is hardcoded which should use values that are already stored in the database (like whitelist and custom bot lists)
const {
  ArtBoardConfig,
  ArtLeaderboard,
  Whitelist,
} = require("../dbObjects.js");
const { PermissionsBitField } = require("discord.js");

module.exports = async (client) => {
  const CUSTOM_BOT_CONFIG = {
    "1129975568646025216": "1291000170032402433",
  };

  function shouldSkipProcessing(guildId, clientId) {
    const customBotId = CUSTOM_BOT_CONFIG[guildId];
    return customBotId && clientId !== customBotId;
  }

  const supportedImageTypes = ["image/png", "image/jpeg", "image/gif"];

  const resetDay = 6;
  const resetHour = 10;
  const resetMinute = 0;

  async function updatedb(reaction, user) {
    if (reaction.partial) {
      try {
        await reaction.fetch().catch(() => {});
      } catch (error) {
        console.error("Something went wrong when fetching the message:", error);
        return;
      }
    }

    if (
      reaction.message.channel.isDMBased() ||
      !reaction.message?.author ||
      reaction.message.author.bot ||
      user.bot
    )
      return;

    const config = await ArtBoardConfig.findOne({
      where: { server_id: reaction.message.guild.id },
    });
    if (!config || !config.artchannels) return;

    const guildwhitelist = await Whitelist.findOne({
      where: { server_id: reaction.message.guild.id },
    });
    if (!guildwhitelist || guildwhitelist.artLeaderboard === false) return;

    const channels = config.artchannels;
    if (!channels || !channels.includes(reaction.message.channel.id)) return;
    if (reaction.message.attachments.size < 0) return;

    var reactedemoji;

    if (reaction.emoji.id === null) {
      reactedemoji = reaction.emoji.name;
    } else if (reaction.emoji.animated === true) {
      reactedemoji = `<a:${reaction.emoji.name}:${reaction.emoji.id}>`;
    } else {
      reactedemoji = `<:${reaction.emoji.name}:${reaction.emoji.id}>`;
    }

    if (reactedemoji !== config.emoji) return;

    var date = new Date();
    var dayOfWeek = date.getDay();
    var daysSinceLastSaturday = (dayOfWeek + 1) % 7;
    var lastSaturday = new Date(
      date.getTime() - daysSinceLastSaturday * 24 * 60 * 60 * 1000,
    );
    lastSaturday.setUTCHours(10, 0, 0, 0);

    if (reaction.message.createdTimestamp < lastSaturday.getTime()) {
      return;
    }

    const users = await reaction.users.fetch();
    const nonBotUsers = users.filter((user) => !user.bot);

    let [leaderboard] = await ArtLeaderboard.findOrCreate({
      where: { server_id: reaction.message.guild.id },
      defaults: { JSON: {} },
    });

    const currentData = leaderboard.JSON || {};

    if (nonBotUsers.size === 0) {
      delete currentData[reaction.message.id];
    } else {
      currentData[reaction.message.id] = {
        reactions: nonBotUsers.size,
        author: reaction.message.author.id,
      };
    }

    leaderboard.JSON = currentData;
    leaderboard.changed("JSON", true);
    await leaderboard.save();
  }

  client.on("messageReactionAdd", async (reaction, user) => {
    await updatedb(reaction, user);
  });

  client.on("messageReactionRemove", async (reaction, user) => {
    await updatedb(reaction, user);
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.guild === null) return;
    if (shouldSkipProcessing(message.guild.id, client.user.id)) return;

    if (message.content === "&resetlb") {
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
      )
        return;
      const guildid = message.guild.id;
      const guild = client.guilds.cache.get(guildid);
      if (guild) {
        resetleaderboard(guild, client);
      }
    } else if (message.content === "&resetfwlb") {
      if (message.author.id !== "808738877945675786") return;
      const guildid = "840703269390647296";
      const guild = client.guilds.cache.get(guildid);
      if (guild) {
        resetleaderboard(guild, client);
      }
    } else if (message.content === "&resetfvlb") {
      if (message.author.id !== "808738877945675786") return;
      const guildid = "1129975568646025216";
      const guild = client.guilds.cache.get(guildid);
      if (guild) {
        resetleaderboard(guild, client);
      }
    } else if (message.content === "&topic") {
      const fs = require("fs");
      const data = fs.readFileSync("topics.json", "utf8");
      const topics = JSON.parse(data);

      const randomIndex = Math.floor(Math.random() * (topics.length - 1));
      const newActivity = topics[randomIndex];
      message.channel.send(newActivity);
    }

    if (message.attachments.size === 0) return;

    const config = await ArtBoardConfig.findOne({
      where: { server_id: message.guild.id },
    });
    if (!config || !config.artchannels) return;

    const guildwhitelist = await Whitelist.findOne({
      where: { server_id: message.guild.id },
    });
    if (!guildwhitelist || guildwhitelist.artLeaderboard === false) return;

    const channels = config.artchannels;
    if (!channels || !channels.includes(message.channel.id)) return;

    const emoji = config.emoji;

    await message.react(emoji);
  });

  async function resetleaderboard(guild, client) {
    if (shouldSkipProcessing(guild.id, client.user.id)) return;

    const config = await ArtBoardConfig.findOne({
      where: {
        server_id: guild.id,
      },
    });

    if (!config || !config.artchannels || !config.artleaderboardchannel) {
      console.error("Missing config data");
      return;
    }

    const artchannels = Array.isArray(config.artchannels)
      ? config.artchannels
      : [config.artchannels];

    const channeltosendid = config.artleaderboardchannel;

    console.log("1");

    if (!artchannels || !channeltosendid) return;

    console.log("1.5");

    const channeltosend = await client.channels.cache.get(channeltosendid);
    const messageContent = "# This week's top three artists:";
    const messages = await channeltosend.messages
      .fetch({ limit: 5 })
      .catch((e) => console.log(e));

    try {
      const leaderboard = await ArtLeaderboard.findOne({
        where: { server_id: guild.id },
      });

      if (!leaderboard || !leaderboard.JSON) {
        console.error("No leaderboard data found");
        return;
      }

      console.log("2");

      const values = Object.entries(leaderboard.JSON)?.map(
        ([messageId, data]) => ({
          id: messageId,
          ...data,
        }),
      );

      console.log("2.5");

      let sortedValues = values.sort((a, b) => b.reactions - a.reactions);
      console.log("Sorted values:", sortedValues);

      async function fetchImage(artchannels, messageId) {
        for (const channelId of artchannels) {
          try {
            const channel = await client.channels.fetch(channelId, {
              force: true,
            });
            if (!channel) {
              console.error(`Channel ID ${channelId} not found`);
              continue;
            }
            await channel.messages.cache.delete(messageId);
            const msg = await channel.messages.fetch(messageId, {
              force: true,
            });
            if (msg) {
              const attachment = msg.attachments.first();
              if (
                attachment &&
                supportedImageTypes.includes(attachment.contentType)
              ) {
                try {
                  const response = await fetch(attachment.url, {
                    method: "HEAD",
                  });
                  if (!response.ok) {
                    console.error(
                      `Attachment URL invalid: ${attachment.url} (${response.status})`,
                    );
                    continue;
                  }
                  return attachment;
                } catch (urlError) {
                  console.error(
                    `Failed to validate URL: ${attachment.url}`,
                    urlError,
                  );
                  continue;
                }
              } else {
                console.error(
                  `Unsupported type: ${attachment.contentType} for msg ${messageId}`,
                );
              }
            }
          } catch (error) {
            console.error(
              `Error in channel ${channelId}, msg ${messageId}:`,
              error,
            );
            continue;
          }
        }
        return null;
      }

      let topPlaces = [];
      for (let i = 0; i < sortedValues.length && topPlaces.length < 3; i++) {
        if (!sortedValues[i].id) {
          console.error("Missing message ID for entry:", sortedValues[i]);
          continue;
        }

        const isDuplicate = topPlaces.some(
          (place) => place.author === sortedValues[i].author,
        );
        if (isDuplicate) {
          console.log(`Skipping duplicate author: ${sortedValues[i].author}`);
          continue;
        }

        let image = await fetchImage(artchannels, sortedValues[i].id);
        if (image) {
          topPlaces.push({ ...sortedValues[i], image });
        }
      }

      console.log("3");

      if (topPlaces.length < 3) {
        console.error("Not enough valid entries found");
        return;
      }

      console.log("4");

      const Canvas = require("canvas");
      const canvas = Canvas.createCanvas(1920, 1080);
      const ctx = canvas.getContext("2d");
      const background = await Canvas.loadImage(
        "./leaderboardimages/gallery2.png",
      );

      console.log(topPlaces);

      const n1 = await Canvas.loadImage(topPlaces[0].image.url.toString());
      const n2 = await Canvas.loadImage(topPlaces[1].image.url.toString());
      const n3 = await Canvas.loadImage(topPlaces[2].image.url.toString());

      const frame = await Canvas.loadImage("./leaderboardimages/artframe.png");
      const gold = await Canvas.loadImage("./leaderboardimages/gold2.png");
      const silver = await Canvas.loadImage("./leaderboardimages/silver2.png");
      const bronze = await Canvas.loadImage("./leaderboardimages/bronze2.png");
      const artist1 = await client.users.fetch(topPlaces[0].author);
      const artist2 = await client.users.fetch(topPlaces[1].author);
      const artist3 = await client.users.fetch(topPlaces[2].author);

      topPlaces = [];

      console.log("5");

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      var pixlinks = 600;
      var verklein = 5;
      var verhouding = 1.35;
      var medalx = -15;
      var medaly = -2;
      var medalverklein = 3.5;
      var omhoog = 150;

      var wrh1 = n1.width / n1.height;
      var wrh2 = n2.width / n2.height;
      var wrh3 = n3.width / n3.height;

      var newWidth1 = canvas.width / verklein;
      var newHeight1 = newWidth1 / wrh1;
      if (newHeight1 > canvas.height) {
        newHeight1 = canvas.height;
        newWidth1 = newHeight1 * wrh1;
      }

      var newWidth2 = canvas.width / verklein;
      var newHeight2 = newWidth2 / wrh2;
      if (newHeight2 > canvas.height) {
        newHeight2 = canvas.height;
        newWidth2 = newHeight2 * wrh2;
      }

      var newWidth3 = canvas.width / verklein;
      var newHeight3 = newWidth3 / wrh3;
      if (newHeight3 > canvas.height) {
        newHeight3 = canvas.height;
        newWidth3 = newHeight3 * wrh3;
      }

      var xOffset1 =
        newWidth1 < canvas.width
          ? (canvas.width - newWidth1) / 2 - pixlinks
          : 0;
      var yOffset1 =
        newHeight1 < canvas.height
          ? (canvas.height - newHeight1) / 2 - omhoog
          : 0;

      var xOffset2 =
        newWidth2 < canvas.width ? (canvas.width - newWidth2) / 2 : 0;
      var yOffset2 =
        newHeight2 < canvas.height
          ? (canvas.height - newHeight2) / 2 - omhoog
          : 0;

      var xOffset3 =
        newWidth3 < canvas.width
          ? (canvas.width - newWidth3) / 2 + pixlinks
          : 0;
      var yOffset3 =
        newHeight3 < canvas.height
          ? (canvas.height - newHeight3) / 2 - omhoog
          : 0;

      var test1 = (newWidth1 * verhouding - newWidth1) / 2;
      var test2 = (newHeight1 * verhouding - newHeight1) / 2;

      ctx.fillStyle = "#FFFFFF";

      ctx.drawImage(
        frame,
        xOffset1 - test1,
        yOffset1 - test2,
        newWidth1 * verhouding,
        newHeight1 * verhouding,
      );
      ctx.fillRect(xOffset1, yOffset1, newWidth1, newHeight1);
      ctx.drawImage(n1, xOffset1, yOffset1, newWidth1, newHeight1);
      ctx.drawImage(
        gold,
        xOffset1 - test1 + medalx,
        yOffset1 - test2 + medaly,
        gold.width / medalverklein,
        gold.height / medalverklein,
      );

      test1 = (newWidth2 * verhouding - newWidth2) / 2;
      test2 = (newHeight2 * verhouding - newHeight2) / 2;

      ctx.drawImage(
        frame,
        xOffset2 - test1,
        yOffset2 - test2,
        newWidth2 * verhouding,
        newHeight2 * verhouding,
      );
      ctx.fillRect(xOffset2, yOffset2, newWidth2, newHeight2);
      ctx.drawImage(n2, xOffset2, yOffset2, newWidth2, newHeight2);
      ctx.drawImage(
        silver,
        xOffset2 - test1 + medalx,
        yOffset2 - test2 + medaly,
        silver.width / medalverklein,
        silver.height / medalverklein,
      );

      test1 = (newWidth3 * verhouding - newWidth3) / 2;
      test2 = (newHeight3 * verhouding - newHeight3) / 2;

      ctx.drawImage(
        frame,
        xOffset3 - test1,
        yOffset3 - test2,
        newWidth3 * verhouding,
        newHeight3 * verhouding,
      );
      ctx.fillRect(xOffset3, yOffset3, newWidth3, newHeight3);
      ctx.drawImage(n3, xOffset3, yOffset3, newWidth3, newHeight3);
      ctx.drawImage(
        bronze,
        xOffset3 - test1 + medalx,
        yOffset3 - test2 + medaly,
        bronze.width / medalverklein,
        bronze.height / medalverklein,
      );

      function getDisplayName(user) {
        if (!user.globalName) return user.username;

        // eslint-disable-next-line no-control-regex
        const specialchar = /[^\x00-\x7F]/.test(user.globalName);
        if (specialchar) {
          return user.username;
        } else {
          return user.globalName;
        }
      }

      // Truncate text
      // function truncateText(ctx, text, maxWidth) {
      //     if (ctx.measureText(text).width <= maxWidth) {
      //         return text;
      //     }

      //     let truncated = text;
      //     while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
      //         truncated = truncated.slice(0, -1);
      //     }

      //     return truncated + '...';
      // }

      // Wrap text
      function wrapText(ctx, text, maxWidth) {
        const words = text.split(" ");
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          const width = ctx.measureText(currentLine + " " + word).width;
          if (width < maxWidth) {
            currentLine += " " + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        lines.push(currentLine);
        return lines;
      }

      function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight = 70) {
        const lines = wrapText(ctx, text, maxWidth);

        const totalHeight = lines.length * lineHeight;
        const startY = y - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line, index) => {
          ctx.fillText(line, x, startY + index * lineHeight);
        });
      }

      ctx.font = "italic 60px Montserrat";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";

      const nameMaxWidth = newWidth1 * 0.9;

      // Option 1: Use truncation
      // const name1 = truncateText(ctx, getDisplayName(artist1), nameMaxWidth);
      // const name2 = truncateText(ctx, getDisplayName(artist2), nameMaxWidth);
      // const name3 = truncateText(ctx, getDisplayName(artist3), nameMaxWidth);

      // ctx.fillText(name1, canvas.width / 2 - pixlinks, yOffset1 + newHeight1 + 90 + (75/wrh1));
      // ctx.fillText(name2, canvas.width / 2, yOffset2 + newHeight2 + 90 + (75/wrh2));
      // ctx.fillText(name3, canvas.width / 2 + pixlinks, yOffset3 + newHeight3 + 90 + (75/wrh3));

      // Option 2: Use text wrapping (replace the above with this if you prefer wrapping)
      drawWrappedText(
        ctx,
        getDisplayName(artist1),
        canvas.width / 2 - pixlinks,
        yOffset1 + newHeight1 + 90 + 75 / wrh1,
        nameMaxWidth,
      );
      drawWrappedText(
        ctx,
        getDisplayName(artist2),
        canvas.width / 2,
        yOffset2 + newHeight2 + 90 + 75 / wrh2,
        nameMaxWidth,
      );
      drawWrappedText(
        ctx,
        getDisplayName(artist3),
        canvas.width / 2 + pixlinks,
        yOffset3 + newHeight3 + 90 + 75 / wrh3,
        nameMaxWidth,
      );

      const final = canvas.toBuffer();

      console.log("6");

      const message = messages.find(
        (msg) =>
          msg.author.id === client.user.id && msg.content === messageContent,
      );
      if (message) {
        await message.delete();
      }

      console.log("7");

      channeltosend.send({
        content: `# This week's top three artists:\n`,
        files: [{ attachment: final }],
      });
      console.log("8");

      await ArtLeaderboard.destroy({ where: { server_id: guild.id } });

      console.log("9");
    } catch (error) {
      channeltosend.send(
        "An error occurred while resetting the leaderboard. Please contact the bot dev with the following error message:\n```\n" +
          error +
          "\n```",
      );
      console.error("Error resetting leaderboard:", error);
    }
  }

  setInterval(async () => {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    if (day === resetDay && hour === resetHour && minute === resetMinute) {
      // Reset the leaderboard
      if (client.user.id === "916372883087974440") {
        const fwguild = client.guilds.cache.get("840703269390647296");
        if (fwguild) {
          console.log("resetting fwguild leaderboard");
          resetleaderboard(fwguild, client);
        }

        setTimeout(() => {
          const novaguild = client.guilds.cache.get("1342201727855624324");
          if (novaguild) {
            console.log("resetting novaguild leaderboard");
            resetleaderboard(novaguild, client);
          }
        });
      }

      if (client.user.id === "1291000170032402433") {
        setTimeout(() => {
          const fvguild = client.guilds.cache.get("1129975568646025216");
          if (fvguild) {
            console.log("resetting fvguild leaderboard");
            if (!shouldSkipProcessing(fvguild.id, client.user.id)) {
              resetleaderboard(fvguild, client);
            }
          }
        }, 10000);
      }
    }
  }, 60000); // Check every minute
};
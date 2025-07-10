const {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");

module.exports = async (interaction, pages, time = 30 * 1000) => {
  try {
    if (!interaction || !pages || !pages > 0)
      throw new Error("Invalid parameters");

    await interaction.deferReply();

    if (pages.length === 1) {
      return await interaction.editReply({
        embeds: [pages[0]],
        componennts: [],
        withResponse: true,
      });
    }

    const prev = new ButtonBuilder()
      .setCustomId("pageprev")
      .setEmoji("⬅️")
      .setStyle("Primary")
      .setDisabled(true);

    // const home = new ButtonBuilder()
    //     .setCustomId('home')
    //     .setEmoji('🏠')
    //     .setStyle('Secondary')
    //     .setDisabled(true);

    const next = new ButtonBuilder()
      .setCustomId("pagenext")
      .setEmoji("➡️")
      .setStyle("Primary");

    const buttons = new ActionRowBuilder()
      // .addComponents(prev, home, next);
      .addComponents(prev, next);
    let index = 0;

    const msg = await interaction.editReply({
      embeds: [pages[index]],
      components: [buttons],
      withResponse: true,
    });

    const mc = await msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time,
    });

    mc.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "You are not allowed to interact with this menu!",
          flags: MessageFlags.Ephemeral,
        });
      }
      await i.deferUpdate();

      if (i.customId === "pageprev") {
        if (index > 0) {
          index--;
        }
        // } else if (index.customId === 'home') {
        //     index = 0;
      } else if (i.customId === "pagenext") {
        if (index < pages.length - 1) {
          index++;
        }
      }

      if (index === 0) {
        prev.setDisabled(true);
        // home.setDisabled(true);
      } else {
        prev.setDisabled(false);
        // home.setDisabled(false);
      }

      if (index === pages.length - 1) {
        next.setDisabled(true);
      } else {
        next.setDisabled(false);
      }

      await msg.edit({
        embeds: [pages[index]],
        components: [buttons],
      });

      mc.resetTimer();

      mc.on("end", async () => {
        // buttons.components.forEach(c => c.setDisabled(true));
        try {
          await msg.edit({
            embeds: [pages[index]],
            components: [],
          });
        } catch (error) {
          if (error.code !== 10008) {
            throw error;
          }
        }
      });

      return msg;
    });
  } catch (err) {
    console.log(err);
  }
};

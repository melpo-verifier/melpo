const {
  ButtonBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");
const { createTemporarySetup } = require("../../js/tempconfigfuncs.js");
const { ServerConfig } = require("../../dbObjects.js");

module.exports = async ({ interaction, whichdefault }) => {
  const { catagorybuttons } = require("../../js/constants.js");
  catagorybuttons.components.forEach((button) => button.setDisabled(false));
  catagorybuttons.components[1].setDisabled(true);

  const serverConfig = await ServerConfig.findOne({
    where: { server_id: interaction.guild.id },
  });

  const { temporarySetup } = await createTemporarySetup(interaction.guild.id);

  const verifiedRole =
    (temporarySetup.verifiedrole || serverConfig.verifiedrole)?.length > 0
      ? temporarySetup.verifiedrole || serverConfig.verifiedrole
      : null;
  const unverifiedRole =
    (temporarySetup.unverifiedrole || serverConfig.unverifiedrole)?.length > 0
      ? temporarySetup.unverifiedrole || serverConfig.unverifiedrole
      : null;
  const autoRole =
    (temporarySetup.autorole || serverConfig.autorole)?.length > 0
      ? temporarySetup.autorole || serverConfig.autorole
      : null;
  const pingRole =
    (temporarySetup.pingrole || serverConfig.pingrole)?.length > 0
      ? temporarySetup.pingrole || serverConfig.pingrole
      : null;
  const managerRole =
    (temporarySetup.managerrole || serverConfig.managerrole)?.length > 0
      ? temporarySetup.managerrole || serverConfig.managerrole
      : null;

  const generalembed = new EmbedBuilder()
    .setColor("#3f7ff1")
    .setTitle("Roles setup")
    .setDescription(
      "[Support server](https://discord.gg/jjGAwwwxZz) | [support me on Ko-Fi](https://ko-fi.com/melpo)\n\nHere you can view and edit the questions that will be asked to users when they apply for verification.",
    )
    .addFields(
      {
        name: "Verified Role (Member Role) `required`",
        value: `*Role(s) assigned when users get verified*\n${verifiedRole ? verifiedRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up (REQUIRED)"}`,
      },
      {
        name: "Auto Role `optional`",
        value: `*Role(s) added to users on join*\n${autoRole ? autoRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
      },
      {
        name: "Unverified Role `optional`",
        value: `*Role(s) to remove from users upon verification*\n${unverifiedRole ? unverifiedRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
      },
      {
        name: "Verification Ping Role `optional`",
        value: `*Role(s) that gets pinged with every new application*\n${pingRole ? pingRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
      },
      {
        name: "Verification Manager Role `optional`",
        value: `*Users with this role can manage applications (no roles = everyone can manage)*\n${managerRole ? managerRole?.map((role) => `<@&${role}>`).join(", ") : "No role(s) set up"}`,
      },
    );

  const finishbuttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("finishsetup")
      .setLabel("Finish Setup")
      .setStyle("Success"),
    new ButtonBuilder()
      .setCustomId("cancelsetup")
      .setLabel("Cancel")
      .setStyle("Danger"),
  );

  const selectRoleMenu = new StringSelectMenuBuilder()
    .setCustomId("selectRoleMenu")
    .setPlaceholder("Select what role you want to edit")
    .addOptions(
      {
        label: "Verified Role (Member Role)",
        description: `Role(s) assigned when users get verified`,
        value: "verifiedRole",
        default: whichdefault === 0 ? true : false,
      },
      {
        label: "Auto Role",
        description: "Role(s) added to users on join",
        value: "autoRole",
        default: whichdefault === 4 ? true : false,
      },
      {
        label: "Unverified Role",
        description: "Role(s) to remove from users upon verification",
        value: "unverifiedRole",
        default: whichdefault === 1 ? true : false,
      },
      {
        label: "Verification Ping Role",
        description: "Role(s) that gets pinged with every new application",
        value: "pingRole",
        default: whichdefault === 2 ? true : false,
      },
      {
        label: "Verification Manager Role",
        description: "Users with this role can manage applications",
        value: "managerRole",
        default: whichdefault === 3 ? true : false,
      },
    );

  const verifiedRoleMenu = new RoleSelectMenuBuilder()
    .setCustomId(`roleMenu_${whichdefault}`)
    .setPlaceholder("Select role to add/edit")
    .setMinValues(0)
    .setMaxValues(10)
    .setDefaultRoles(
      (whichdefault === 0
        ? (verifiedRole ?? [])
        : whichdefault === 1
          ? (unverifiedRole ?? [])
          : whichdefault === 2
            ? (pingRole ?? [])
            : whichdefault === 3
              ? (managerRole ?? [])
              : whichdefault === 4
                ? (autoRole ?? [])
                : []
      ).slice(0, 10),
    );

  const rolemenus = [
    new ActionRowBuilder().setComponents(selectRoleMenu),
    new ActionRowBuilder().setComponents(verifiedRoleMenu),
  ];

  await interaction.update({
    content: "",
    embeds: [generalembed],
    components: [catagorybuttons, ...rolemenus, finishbuttons],
    files: [],
  });
};

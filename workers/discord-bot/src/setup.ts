import path from "node:path";
import dotenv from "dotenv";
const rootDir = path.resolve(process.cwd(), "..", "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  type Guild,
  type Role,
  type CategoryChannel,
} from "discord.js";
import { ROLES, CATEGORIES, RULES_EMBED, ACCEPT_BUTTON, type CategoryDef } from "./config.js";

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN or DISCORD_GUILD_ID in .env.local");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function findOrCreateRole(guild: Guild, name: string, color: number, permissions: bigint[]): Promise<Role> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) {
    console.log(`  [SKIP] Role "${name}" already exists`);
    return existing;
  }
  const role = await guild.roles.create({
    name,
    colors: { primaryColor: color },
    permissions,
    reason: "Frinter Core setup",
  });
  console.log(`  [CREATE] Role "${name}"`);
  return role;
}

async function setupRoles(guild: Guild): Promise<Map<string, Role>> {
  console.log("\n── Creating roles ──");
  const roleMap = new Map<string, Role>();

  for (const def of ROLES) {
    const role = await findOrCreateRole(guild, def.name, def.color, [...def.permissions]);
    roleMap.set(def.name, role);
  }

  // Set role hierarchy: Admin > Moderator > Founding Builder > Builder
  const roleOrder = ["Builder", "Founding Builder", "Moderator", "Admin"];
  for (let i = 0; i < roleOrder.length; i++) {
    const role = roleMap.get(roleOrder[i]);
    if (role) {
      await role.setPosition(i + 1).catch(() => {});
    }
  }

  return roleMap;
}

async function setupCategory(
  guild: Guild,
  def: CategoryDef,
  roleMap: Map<string, Role>
): Promise<void> {
  console.log(`\n── Category: ${def.name} ──`);

  const builderRole = roleMap.get("Builder")!;
  const foundingRole = roleMap.get("Founding Builder")!;
  const modRole = roleMap.get("Moderator")!;
  const adminRole = roleMap.get("Admin")!;

  let category = guild.channels.cache.find(
    (ch) => ch.name === def.name && ch.type === ChannelType.GuildCategory
  ) as CategoryChannel | undefined;

  if (!category) {
    const permOverwrites = [];

    if (def.visibleTo === "builders") {
      permOverwrites.push(
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: builderRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: foundingRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      );
    } else if (def.visibleTo === "admin") {
      permOverwrites.push(
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      );
    } else {
      permOverwrites.push(
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel] },
      );
    }

    category = await guild.channels.create({
      name: def.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites: permOverwrites,
      reason: "Frinter Core setup",
    }) as CategoryChannel;
    console.log(`  [CREATE] Category "${def.name}"`);
  } else {
    console.log(`  [SKIP] Category "${def.name}" already exists`);
  }

  for (const chDef of def.channels) {
    const existing = guild.channels.cache.find(
      (ch) => ch.name === chDef.name && ch.parentId === category!.id
    );
    if (existing) {
      console.log(`  [SKIP] #${chDef.name} already exists`);
      continue;
    }

    const channelOverwrites = [];

    if (chDef.name === "rules") {
      channelOverwrites.push(
        { id: guild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: builderRole.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: foundingRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      );
    }

    if (chDef.name === "welcome") {
      channelOverwrites.push(
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: builderRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: foundingRole.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: modRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel] },
      );
    }

    await guild.channels.create({
      name: chDef.name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: chDef.topic,
      permissionOverwrites: channelOverwrites.length > 0 ? channelOverwrites : undefined,
      reason: "Frinter Core setup",
    });
    console.log(`  [CREATE] #${chDef.name}`);
  }
}

async function postRulesEmbed(guild: Guild): Promise<void> {
  console.log("\n── Posting rules embed ──");

  const rulesChannel = guild.channels.cache.find(
    (ch) => ch.name === "rules" && ch.type === ChannelType.GuildText
  );
  if (!rulesChannel || !rulesChannel.isTextBased()) {
    console.error("  [ERROR] #rules channel not found");
    return;
  }

  const messages = await rulesChannel.messages.fetch({ limit: 10 });
  const botMessage = messages.find(
    (m) => m.author.id === client.user!.id && m.components.length > 0
  );
  if (botMessage) {
    console.log("  [SKIP] Rules embed already posted");
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(RULES_EMBED.title)
    .setDescription(RULES_EMBED.description)
    .setColor(RULES_EMBED.color);

  const button = new ButtonBuilder()
    .setCustomId(ACCEPT_BUTTON.customId)
    .setLabel(ACCEPT_BUTTON.label)
    .setStyle(ACCEPT_BUTTON.style);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await rulesChannel.send({ embeds: [embed], components: [row] });
  console.log("  [CREATE] Rules embed with button posted");
}

async function main() {
  console.log("🔧 Frinter Core — Discord Server Setup\n");

  await client.login(TOKEN);
  console.log(`Logged in as ${client.user!.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID!);
  await guild.channels.fetch();
  await guild.roles.fetch();

  const roleMap = await setupRoles(guild);

  for (const categoryDef of CATEGORIES) {
    await setupCategory(guild, categoryDef, roleMap);
  }

  await postRulesEmbed(guild);

  console.log("\n✅ Setup complete!");
  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});

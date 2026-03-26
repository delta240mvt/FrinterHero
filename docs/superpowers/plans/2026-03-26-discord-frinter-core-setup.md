# Discord "Frinter Core" Server Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated Discord server setup + runtime bot for the "Frinter Core" community — roles, channels, permissions, onboarding button, welcome messages. Bot runs as a standalone worker service on Railway.

**Architecture:** Standalone workspace `workers/discord-bot/` with three source files — shared config (constants), one-time setup script, runtime bot. Follows existing worker pattern (`@frinter/` namespace, `tsx src/index.ts`). Setup uses discord.js REST to create roles/channels/permissions and post the rules embed. Bot uses discord.js Gateway to listen for button clicks, joins, and leaves.

**Tech Stack:** TypeScript, discord.js v14, tsx runner, dotenv for env vars.

**Spec:** `docs/superpowers/specs/2026-03-26-discord-frinter-core-setup-design.md`

---

## File Structure

```
workers/discord-bot/
  package.json          — @frinter/discord-bot workspace, discord.js + dotenv deps
  src/
    config.ts           — Shared constants: role definitions, channel definitions, messages, colors
    setup.ts            — One-time setup: creates roles, categories, channels, permissions, posts rules embed
    index.ts            — Runtime bot: onboarding button handler, welcome messages, join/leave logs
infra/railway/env/
  discord-bot.env.example — Railway env template
```

**Modifications:**
- Root `package.json` — add `discord:setup` and `discord:bot` npm scripts pointing to the workspace

---

### Task 1: Scaffold workers/discord-bot workspace

**Files:**
- Create: `workers/discord-bot/package.json`

- [ ] **Step 1: Create the package.json**

Create `workers/discord-bot/package.json`:

```json
{
  "name": "@frinter/discord-bot",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node ../../scripts/monorepo/noop-build.mjs discord-bot",
    "start": "tsx src/index.ts",
    "setup": "tsx src/setup.ts"
  }
}
```

- [ ] **Step 2: Install dependencies in the workspace**

Run:
```bash
npm install --workspace workers/discord-bot discord.js dotenv
```

Expected: `discord.js`, `dotenv` added to `workers/discord-bot/package.json` dependencies. `tsx` is already in root `devDependencies` and will be resolved via workspace hoisting.

- [ ] **Step 3: Add convenience scripts to root package.json**

Add these two entries to the `"scripts"` section in root `package.json`, after the `"reddit:seed"` line:

```json
"discord:setup": "npm --workspace workers/discord-bot run setup",
"discord:bot": "npm --workspace workers/discord-bot run start"
```

- [ ] **Step 4: Verify workspace is recognized**

Run:
```bash
npm ls @frinter/discord-bot
```

Expected: shows `@frinter/discord-bot` in the workspace tree.

- [ ] **Step 5: Commit**

```bash
git add workers/discord-bot/package.json package.json package-lock.json
git commit -m "chore: scaffold workers/discord-bot workspace with discord.js"
```

---

### Task 2: Create config.ts (shared constants)

**Files:**
- Create: `workers/discord-bot/src/config.ts`

- [ ] **Step 1: Write config.ts**

```typescript
import { PermissionFlagsBits, ButtonStyle } from "discord.js";

// ── Brand Colors (as Discord integer format) ─────────────────────
export const COLORS = {
  GOLD: 0xd6b779,
  VIOLET: 0x8a4e64,
  TEAL: 0x4a8d83,
  WHITE: 0xffffff,
  GRAY: 0x808080,
} as const;

// ── Role Definitions ─────────────────────────────────────────────
export const ROLES = [
  { name: "Admin", color: COLORS.GOLD, permissions: [PermissionFlagsBits.Administrator] },
  { name: "Moderator", color: COLORS.VIOLET, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.KickMembers] },
  { name: "Founding Builder", color: COLORS.TEAL, permissions: [] },
  { name: "Builder", color: COLORS.WHITE, permissions: [] },
] as const;

// ── Category & Channel Definitions ───────────────────────────────
export interface ChannelDef {
  name: string;
  topic?: string;
}

export interface CategoryDef {
  name: string;
  channels: ChannelDef[];
  visibleTo: "everyone" | "builders" | "admin";
}

export const CATEGORIES: CategoryDef[] = [
  {
    name: "📋 ONBOARDING",
    visibleTo: "everyone",
    channels: [
      { name: "rules", topic: "Read the rules and click the button to join." },
      { name: "welcome", topic: "Welcome messages for new members." },
    ],
  },
  {
    name: "🇵🇱 POLSKA",
    visibleTo: "builders",
    channels: [
      { name: "pl-general", topic: "Luźne rozmowy po polsku" },
      { name: "pl-showcase", topic: "Pokaż co budujesz" },
      { name: "pl-help", topic: "Pytania, problemy, code review" },
      { name: "pl-resources", topic: "Linki, tutoriale, narzędzia" },
      { name: "pl-offtopic", topic: "Memy, random, luźne" },
    ],
  },
  {
    name: "🌍 GLOBAL (EN)",
    visibleTo: "builders",
    channels: [
      { name: "en-general", topic: "Casual chat in English" },
      { name: "en-showcase", topic: "Show what you're building" },
      { name: "en-help", topic: "Questions, problems, code review" },
      { name: "en-resources", topic: "Links, tutorials, tools" },
      { name: "en-offtopic", topic: "Memes, random, casual" },
    ],
  },
  {
    name: "🔧 ADMIN",
    visibleTo: "admin",
    channels: [
      { name: "admin-chat", topic: "Internal discussions" },
      { name: "admin-logs", topic: "Bot logs, joins, leaves" },
    ],
  },
];

// ── Messages ─────────────────────────────────────────────────────
export const RULES_EMBED = {
  title: "Welcome to Frinter Core!",
  description: [
    "A community for builders creating with AI.",
    "",
    "**Rules:**",
    "1. Respect others — zero hate, zero drama",
    "2. Write in Polish in 🇵🇱, in English in 🌍",
    "3. Showcase > self-promo — show what you build, don't spam links",
    "4. Help others — you were a beginner once",
    "5. No NSFW, no politics",
    "",
    "Click the button below to join.",
  ].join("\n"),
  color: COLORS.GOLD,
};

export const WELCOME_MESSAGE_TEMPLATE = (userId: string) =>
  `**Welcome <@${userId}>!** You're now part of Frinter Core — a community of builders creating with AI. Show what you're building in #pl-showcase / #en-showcase or ask for help in #pl-help / #en-help. Let's build!`;

export const ACCEPT_BUTTON = {
  customId: "accept-rules",
  label: "I accept the rules",
  style: ButtonStyle.Success,
} as const;
```

- [ ] **Step 2: Verify it compiles**

Run from repo root:
```bash
npx tsx workers/discord-bot/src/config.ts && echo "config OK"
```

Expected: `config OK` (file has no side effects, just exports)

- [ ] **Step 3: Commit**

```bash
git add workers/discord-bot/src/config.ts
git commit -m "feat(discord): add shared config with roles, channels, and messages"
```

---

### Task 3: Create setup.ts (one-time server setup)

**Files:**
- Create: `workers/discord-bot/src/setup.ts`

- [ ] **Step 1: Write setup.ts**

```typescript
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
    color,
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
```

- [ ] **Step 2: Verify it compiles**

Run from repo root:
```bash
npx tsx workers/discord-bot/src/setup.ts 2>&1 | head -3
```

Expected: "Missing DISCORD_TOKEN" error (no real token) — NOT TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add workers/discord-bot/src/setup.ts
git commit -m "feat(discord): add one-time server setup script"
```

---

### Task 4: Create index.ts (runtime bot)

**Files:**
- Create: `workers/discord-bot/src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
import path from "node:path";
import dotenv from "dotenv";
const rootDir = path.resolve(process.cwd(), "..", "..");
dotenv.config({ path: path.join(rootDir, ".env.local") });

import {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  type TextChannel,
  type GuildMember,
  type Interaction,
} from "discord.js";
import { ACCEPT_BUTTON, WELCOME_MESSAGE_TEMPLATE } from "./config.js";

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_TOKEN or DISCORD_GUILD_ID in .env.local");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

function timestamp(): string {
  return new Date().toISOString();
}

function getChannel(name: string): TextChannel | undefined {
  const guild = client.guilds.cache.get(GUILD_ID!);
  if (!guild) return undefined;
  return guild.channels.cache.find(
    (ch) => ch.name === name && ch.type === ChannelType.GuildText
  ) as TextChannel | undefined;
}

async function logToAdmin(message: string): Promise<void> {
  const channel = getChannel("admin-logs");
  if (channel) {
    await channel.send(message).catch(console.error);
  }
}

// ── Button interaction: accept rules ─────────────────────────────
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== ACCEPT_BUTTON.customId) return;

  const member = interaction.member as GuildMember;
  const guild = interaction.guild;
  if (!guild) return;

  const builderRole = guild.roles.cache.find((r) => r.name === "Builder");
  if (!builderRole) {
    await interaction.reply({ content: "Setup error: Builder role not found. Please contact an admin.", ephemeral: true });
    await logToAdmin(`[ERROR] Builder role not found when ${member.user.tag} (${member.id}) clicked accept`);
    return;
  }

  if (member.roles.cache.has(builderRole.id)) {
    await interaction.reply({ content: "You're already a member!", ephemeral: true });
    return;
  }

  try {
    await member.roles.add(builderRole, "Accepted rules via onboarding button");
    await interaction.reply({ content: "Welcome aboard! You now have access to all channels.", ephemeral: true });

    const welcomeChannel = getChannel("welcome");
    if (welcomeChannel) {
      await welcomeChannel.send(WELCOME_MESSAGE_TEMPLATE(member.id));
    }

    await logToAdmin(`[ONBOARD] ${member.user.tag} (${member.id}) accepted rules at ${timestamp()}`);
    console.log(`[ONBOARD] ${member.user.tag} accepted rules`);
  } catch (err) {
    await interaction.reply({ content: "Something went wrong. Please contact an admin.", ephemeral: true });
    await logToAdmin(`[ERROR] Failed to assign Builder role to ${member.user.tag} (${member.id}): ${err}`);
    console.error(`[ERROR] Role assignment failed for ${member.user.tag}:`, err);
  }
});

// ── Member join log ──────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
  await logToAdmin(`[JOIN] ${member.user.tag} (${member.id}) at ${timestamp()}`);
  console.log(`[JOIN] ${member.user.tag}`);
});

// ── Member leave log ─────────────────────────────────────────────
client.on(Events.GuildMemberRemove, async (member) => {
  await logToAdmin(`[LEAVE] ${member.user.displayName} (${member.id}) at ${timestamp()}`);
  console.log(`[LEAVE] ${member.user.displayName}`);
});

// ── Bot ready ────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Frinter Core bot online as ${c.user.tag}`);
  console.log(`   Guild: ${GUILD_ID}`);
  console.log(`   Listening for interactions...`);
});

client.login(TOKEN);
```

- [ ] **Step 2: Verify it compiles**

Run from repo root:
```bash
npx tsx workers/discord-bot/src/index.ts 2>&1 | head -3
```

Expected: "Missing DISCORD_TOKEN" error — NOT TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add workers/discord-bot/src/index.ts
git commit -m "feat(discord): add runtime bot with onboarding, welcome, and logging"
```

---

### Task 5: Add Railway env template

**Files:**
- Create: `infra/railway/env/discord-bot.env.example`

- [ ] **Step 1: Create Railway env template**

Create `infra/railway/env/discord-bot.env.example`:

```env
# Discord Bot — Frinter Core community server
DISCORD_TOKEN=
DISCORD_GUILD_ID=
# DISCORD_WEBHOOK_URL is used by scripts/notifier.ts (GEO Monitor), not by this bot
```

- [ ] **Step 2: Commit**

```bash
git add infra/railway/env/discord-bot.env.example
git commit -m "chore: add Railway env template for discord bot"
```

---

### Task 6: Test the full flow locally

**Files:** None (manual testing)

**Prerequisites:**
- `DISCORD_TOKEN` and `DISCORD_GUILD_ID` set in `.env.local`
- **Privileged Gateway Intent:** In the [Discord Developer Portal](https://discord.com/developers/applications), go to your bot's settings → Bot → Privileged Gateway Intents → enable **Server Members Intent**. Without this, `GuildMemberAdd` and `GuildMemberRemove` events will silently fail (no join/leave logs).

- [ ] **Step 1: Run the setup script**

Run:
```bash
npm run discord:setup
```

Expected output:
```
🔧 Frinter Core — Discord Server Setup

Logged in as BotName#1234

── Creating roles ──
  [CREATE] Role "Admin"
  [CREATE] Role "Moderator"
  [CREATE] Role "Founding Builder"
  [CREATE] Role "Builder"

── Category: 📋 ONBOARDING ──
  [CREATE] Category "📋 ONBOARDING"
  [CREATE] #rules
  [CREATE] #welcome
...
── Posting rules embed ──
  [CREATE] Rules embed with button posted

✅ Setup complete!
```

Verify in Discord:
- 4 categories visible
- All channels created with correct names
- Rules embed visible in `#rules` with green button
- ADMIN category hidden from regular users

- [ ] **Step 2: Run the setup script again (idempotency check)**

Run:
```bash
npm run discord:setup
```

Expected: All lines say `[SKIP]`. No duplicates created.

- [ ] **Step 3: Start the bot**

Run:
```bash
npm run discord:bot
```

Expected:
```
🤖 Frinter Core bot online as BotName#1234
   Guild: <guild-id>
   Listening for interactions...
```

- [ ] **Step 4: Test onboarding flow**

In Discord (with an alt account or by removing your Builder role):
1. Click "I accept the rules" button in `#rules`
2. Verify: ephemeral message "Welcome aboard!"
3. Verify: `#rules` disappears, community channels appear
4. Verify: welcome message appears in `#welcome` with mention
5. Verify: `[ONBOARD]` log entry in `#admin-logs`

- [ ] **Step 5: Commit any fixes**

If any adjustments were needed during testing:
```bash
git add workers/discord-bot/
git commit -m "fix(discord): adjustments from local testing"
```

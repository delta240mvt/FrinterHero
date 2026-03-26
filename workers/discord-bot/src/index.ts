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
  await logToAdmin(`[LEAVE] ${member.user.tag} (${member.id}) at ${timestamp()}`);
  console.log(`[LEAVE] ${member.user.tag}`);
});

// ── Bot ready ────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Frinter Core bot online as ${c.user.tag}`);
  console.log(`   Guild: ${GUILD_ID}`);
  console.log(`   Listening for interactions...`);
});

client.login(TOKEN);

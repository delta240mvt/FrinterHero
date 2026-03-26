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

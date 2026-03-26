# Discord "Frinter Core" Server Setup — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Goal:** Automated Discord server setup script for the "Frinter Core" community — builders creating with AI.

## Tech Stack

- **Runtime:** Node.js + TypeScript, executed via `tsx` (already in devDependencies)
- **Library:** discord.js v14 — must be installed: `npm install discord.js`
- **Entry point:** `scripts/discord-setup.ts`
- **Bot:** Already exists and is added to the server. Token and Guild ID in `.env`.
- **Execution:** `tsx scripts/discord-setup.ts` (one-time), `tsx scripts/discord-bot.ts` (long-running)
- **Hosting:** `discord-bot.ts` runs locally during development. Production: Railway service (alongside existing infra).

## Roles

| Role | Color | Purpose | Assignment |
|------|-------|---------|------------|
| `Admin` | `#d6b779` (gold) | Full permissions | Manual |
| `Moderator` | `#8a4e64` (violet) | Channel management, mute, kick | Manual |
| `Founding Builder` | `#4a8d83` (teal) | Early adopters | Manual |
| `Builder` | `#ffffff` (white) | Active member after accepting rules | Bot (onboarding button) |
| `Guest` | `#808080` (gray) | Before accepting rules — sees only #rules | Default (@everyone) |

## Channel Structure

```
📋 ONBOARDING
  #rules              — Rules embed + "I accept the rules" button (EN)
  #welcome            — Bot welcome messages (EN)

🇵🇱 POLSKA
  #pl-general         — Casual chat (PL)
  #pl-showcase        — Show what you're building
  #pl-help            — Questions, problems, code review
  #pl-resources       — Links, tutorials, tools
  #pl-offtopic        — Memes, random, casual

🌍 GLOBAL (EN)
  #en-general         — Casual chat (EN)
  #en-showcase        — Show what you're building
  #en-help            — Questions, problems, code review
  #en-resources       — Links, tutorials, tools
  #en-offtopic        — Memes, random, casual

🔧 ADMIN (hidden, Admin + Moderator only)
  #admin-chat         — Internal discussions
  #admin-logs         — Bot logs, joins, leaves
```

## Permissions Model

- **@everyone (Guest):** `ViewChannel = ALLOW` on `#rules` only. All other channels: `ViewChannel = DENY`.
- **Builder:** `ViewChannel = DENY` override on `#rules` (hides it despite @everyone ALLOW). `ViewChannel = ALLOW` on all community channels (ONBOARDING/#welcome, POLSKA, GLOBAL). `SendMessages = DENY` on `#welcome` (read-only). No access to ADMIN channels.
- **Founding Builder:** Same permissions as Builder. Role hierarchy: above Builder, below Moderator (visual distinction + future-proof).
- **Moderator:** Builder permissions + `ManageMessages`, `MuteMembers`, `KickMembers`. `ViewChannel = ALLOW` on ADMIN channels.
- **Admin:** Full permissions (Administrator flag).

## Onboarding Flow

1. New user joins → gets default `@everyone` (Guest) permissions
2. Guest sees only `#rules`
3. `#rules` contains an embed with rules + a **"I accept the rules"** button
4. User clicks button → bot assigns `Builder` role
5. `Builder` role grants access to all community channels, hides `#rules`
6. Bot sends welcome message to `#welcome`

## Rules Embed (in #rules)

- Color: `#d6b779` (gold)
- Content:

> **Welcome to Frinter Core!**
>
> A community for builders creating with AI.
>
> **Rules:**
> 1. Respect others — zero hate, zero drama
> 2. Write in Polish in 🇵🇱, in English in 🌍
> 3. Showcase > self-promo — show what you build, don't spam links
> 4. Help others — you were a beginner once
> 5. No NSFW, no politics
>
> Click the button below to join.

- Button label: **"I accept the rules"**
- Button style: Success (green)

## Welcome Message (in #welcome)

Triggered after user clicks the rules button. Sent by bot to `#welcome`:

> **Welcome {user}!** You're now part of Frinter Core — a community of builders creating with AI. Show what you're building in #pl-showcase / #en-showcase or ask for help in #pl-help / #en-help. Let's build!

`{user}` resolves to a Discord mention (`<@userId>`) so the user gets a notification ping.

## Bot Behavior

The bot serves two purposes:

1. **Setup script** (`scripts/discord-setup.ts`): Run once to create all roles, categories, channels, permissions, and post the rules embed with button. **Idempotent via name-based check:** before creating any role/channel, check if one with the same name already exists and skip creation. This allows safe re-runs without duplicates.
2. **Runtime listener**: Stays online to handle:
   - Button interaction in `#rules` → assign `Builder` role
   - Send welcome message to `#welcome`
   - Log joins/leaves to `#admin-logs`

## Environment Variables

```env
DISCORD_TOKEN=<bot token>
DISCORD_GUILD_ID=<server id>
```

Already declared in `.env.example` (lines 31-33).

## File Structure

Standalone workspace following existing worker pattern (`@frinter/` namespace):

```
workers/discord-bot/
  package.json            — @frinter/discord-bot, discord.js + dotenv + tsx deps
  src/
    config.ts             — Shared constants (role names, colors, channel names, messages)
    setup.ts              — One-time server setup (roles, channels, permissions, rules embed)
    index.ts              — Runtime bot (onboarding button handler, welcome messages, logs)
```

## npm scripts

Root `package.json` convenience scripts:
```json
"discord:setup": "npm --workspace workers/discord-bot run setup",
"discord:bot": "npm --workspace workers/discord-bot run start"
```

## Error Handling

- If the bot fails to assign the `Builder` role (missing permissions, role deleted), it replies ephemerally to the user with an error message and logs the failure to `#admin-logs`.
- Join/leave logs in `#admin-logs` use plain text: `[JOIN] username#1234 (id) at timestamp` / `[LEAVE] username#1234 (id) at timestamp`.

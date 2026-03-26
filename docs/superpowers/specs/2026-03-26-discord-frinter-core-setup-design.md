# Discord "Frinter Core" Server Setup — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Goal:** Automated Discord server setup script for the "Frinter Core" community — builders creating with AI.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Library:** discord.js v14
- **Entry point:** `scripts/discord-setup.ts`
- **Bot:** Already exists and is added to the server. Token and Guild ID in `.env`.

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

- **@everyone (Guest):** Can only see `#rules`. All other channels hidden.
- **Builder:** Can see all channels except ADMIN. Cannot see `#rules` (removed after onboarding). Read + write in community channels. Read-only in `#welcome`.
- **Founding Builder:** Same as Builder (visual distinction only).
- **Moderator:** Builder permissions + manage messages, mute, kick, access to ADMIN channels.
- **Admin:** Full permissions.

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

## Bot Behavior

The bot serves two purposes:

1. **Setup script** (`scripts/discord-setup.ts`): Run once to create all roles, categories, channels, permissions, and post the rules embed with button. Idempotent — can be re-run safely.
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

```
scripts/
  discord-setup.ts        — One-time server setup (roles, channels, permissions, rules embed)
  discord-bot.ts          — Runtime bot (onboarding button handler, welcome messages, logs)
  discord-config.ts       — Shared constants (role names, colors, channel names, messages)
```

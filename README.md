# Nerif

Telegram-based personal fitness assistant for calories, weight, goals, progress,
and food-photo analysis.

This repo follows the scaffold described in `fitness-bot-spec.md`:

- Bun workspace monorepo
- `packages/core` for schema, config, prompts, and shared business logic
- `packages/bot` for the grammY Telegram bot
- `packages/web` as a Next.js dashboard placeholder for v2
- SQLite through `bun:sqlite` at runtime, Drizzle schema and `db:push` tooling

## Setup

```sh
bun install
cp .env.example .env
bun run db:push
```

Fill `.env` with `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, and a 32-byte hex
`ENCRYPTION_KEY`:

```sh
openssl rand -hex 32
```

## Commands

```sh
bun run typecheck
bun run build
bun run db:push
bun run bot
```

## Current Slice

Implemented:

- Monorepo scaffold and workspace scripts
- Full Drizzle schema from the spec
- Core config, nutrition, streak, goal, rate-limit, and Gemini validation helpers
- Prompt files for food scanning and target analysis
- Bootable grammY bot shell with command handlers and scheduler stub
- Next.js placeholder dashboard
- Docker and Compose files for VPS deployment

Next build slice: full onboarding with manual targets and TDEE suggestion.

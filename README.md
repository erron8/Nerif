# Nerif

Telegram-based personal fitness assistant for calories, weight, goals, progress,
notes, and food-photo analysis.

Nerif is a Bun/TypeScript monorepo with:

- `packages/core` — Drizzle schema, SQLite client, config, prompts, and shared services
- `packages/bot` — grammY Telegram bot
- `packages/web` — Next.js dashboard placeholder for a later web UI

## What Works

- Onboarding with profile setup, timezone, activity level, TDEE estimate, and targets
- Main Telegram menu with inline buttons
- Manual food logging with `/log`
- Food-photo scanning with Gemini via `/scan`
- Scan rate limits with per-user overrides
- Exercise burn logging with `/burn`
- Weight logging with `/weight`
- Notes with `/note`
- Today and week progress views
- Goal and streak views
- Settings for targets, timezone, DND window, scan limits, profile, and reset
- Morning weight reminders and end-of-day summaries
- SQLite persistence through Drizzle
- Docker Compose deployment

Some surfaces are intentionally still placeholders:

- `/export`
- Notification-mode configuration
- LLM provider/API-key settings UI
- Web dashboard

## Requirements

- Bun
- Telegram bot token from BotFather
- Gemini API key
- SQLite-compatible local filesystem storage

## Setup

```sh
bun install
cp .env.example .env
```

Fill `.env`:

```sh
TELEGRAM_BOT_TOKEN=
GEMINI_API_KEY=
ENCRYPTION_KEY=
```

Generate `ENCRYPTION_KEY` with:

```sh
openssl rand -hex 32
```

Then create/update the SQLite schema:

```sh
bun run db:push
```

Start the bot:

```sh
bun run bot
```

## Common Commands

```sh
bun run typecheck
bun test
bun run build
bun run db:push
bun run bot
```

Package-level commands also exist:

```sh
bun --cwd packages/bot run typecheck
bun --cwd packages/core run typecheck
bun --cwd packages/core run db:push
```

## Telegram Commands

- `/start` — set up or reopen Nerif
- `/menu` — open the main menu
- `/log meal | kcal | protein | carbs | fat` — log food manually
- `/scan` — scan food from a photo
- `/today` — show today's totals
- `/week` — show recent daily results
- `/history` — show today's meals
- `/delete_last` — remove the latest meal logged today
- `/burn activity | kcal | minutes` — log exercise burn
- `/weight kg` — log today's weight
- `/goals` — view goals
- `/note text #tag` — save a note
- `/settings` — open settings
- `/cancel` — cancel the current flow

## Data And Storage

Default local paths:

- Database: `./data/nerif.db`
- Food scan images: `./data/images`

Docker sets:

```sh
DB_PATH=/app/data/nerif.db
```

and mounts local `./data` to `/app/data`.

Runtime data is intentionally ignored by git except `data/.gitkeep`.

## Docker

Build and run with Compose:

```sh
docker compose up --build -d
```

Stop:

```sh
docker compose down
```

Logs:

```sh
docker compose logs -f bot
```

## Testing

Current test coverage includes core service tests and focused bot behavior tests:

- Date/timezone helpers, including DST edge cases
- Daily aggregation
- Goal evaluation
- Nutrition/TDEE helpers
- Streak evaluation
- Gemini prompt/path utilities
- Scan rate limits
- Reset/data cleanup behavior
- Scan failure logging cleanup
- Scheduler DND helper behavior

Run all tests:

```sh
bun test
```

## Known Gaps

- README and code assume polling via `bot.start`; webhook deployment is not configured.
- Export, notification settings, LLM settings, and the web dashboard are not complete.
- There are no generated Drizzle migration files yet; schema changes are applied with `db:push`.
- Bot test coverage is focused on critical behavior, not every Telegram handler path.

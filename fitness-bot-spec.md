# Nerif

A Telegram-based personal fitness assistant for tracking calories, weight, goals, and progress. Built for personal use, not productized — minimal dependencies, single-user mindset, fully self-hosted.

Designed as a **TypeScript monorepo from day one** so the future web dashboard is an additive package, not a rewrite.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Bun** 1.1+ | Fast, native TS, built-in SQLite, single binary |
| Language | **TypeScript** 5.5+ | End-to-end type safety from schema to UI |
| Monorepo | **Turborepo** + Bun workspaces | Build orchestration, shared deps, fast cache |
| Database | **SQLite** (via `bun:sqlite`) | Single-user, zero infra. Swappable to Postgres later via Drizzle |
| ORM | **Drizzle** | Type-safe schema shared across bot and web |
| Bot framework | **grammY** + `@grammyjs/conversations` | Modern, TS-first, excellent multi-step flows |
| AI vision | **`@google/genai`** (Gemini 2.5 Flash) | Cheap, fast, solid vision |
| Optional LLMs | **`openai`**, **`@anthropic-ai/sdk`** | User-configurable per spec |
| Scheduler | **`croner`** | Timezone-aware cron, no extra services |
| Image handling | **`sharp`** | Standard, very fast |
| Env validation | **Zod** + `process.env` | Runtime + compile-time typed config |
| Web framework (future) | **Next.js 15** (App Router, RSC) | Best DX, deploys anywhere |
| UI library (future) | **shadcn/ui + Tailwind** | Minimal, dark-aesthetic friendly |
| Web auth (future) | **Auth.js** + Telegram Login Widget | Same Telegram identity as bot |
| Deployment | Docker → VPS | Bot + DB on VPS; web optionally Vercel later |

Skip: heavyweight ORMs, Redis (overkill), Express/FastAPI (no HTTP layer needed for v1), Celery-equivalents (`croner` handles it).

---

## Monorepo Layout

```
nerif/
├── turbo.json
├── package.json              # root, workspaces + scripts
├── bun.lockb
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── packages/
│   ├── core/                 # ⭐ shared business logic + DB schema
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── config.ts         # zod schema, loads from process.env
│   │       ├── db/
│   │       │   ├── schema.ts     # all Drizzle tables
│   │       │   ├── client.ts     # db instance, migrations
│   │       │   └── seed.ts
│   │       ├── services/
│   │       │   ├── gemini.ts     # vision + target analysis
│   │       │   ├── nutrition.ts  # TDEE, macros, safe deadlines
│   │       │   ├── streak.ts     # daily evaluation, streak math
│   │       │   ├── goal-eval.ts  # goal resolution, deadline pings
│   │       │   └── rate-limit.ts # scan counter
│   │       ├── prompts/
│   │       │   ├── food-scan-v1.txt
│   │       │   └── target-analysis-v1.txt
│   │       └── types.ts          # shared types not derived from schema
│   ├── bot/                  # Telegram bot
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # entry: build bot, register, start polling + scheduler
│   │       ├── bot.ts            # grammY Bot factory
│   │       ├── scheduler.ts      # croner setup, DND enforcement
│   │       ├── middleware/
│   │       │   ├── session.ts    # grammY conversation session
│   │       │   └── user-load.ts  # loads User by tg_id into ctx
│   │       └── handlers/
│   │           ├── onboarding.ts
│   │           ├── menu.ts
│   │           ├── intake.ts
│   │           ├── scan.ts
│   │           ├── burn.ts
│   │           ├── weight.ts
│   │           ├── progress.ts
│   │           ├── goals.ts
│   │           ├── notes.ts
│   │           ├── settings.ts
│   │           └── export.ts
│   └── web/                  # ⏳ Next.js dashboard (placeholder for v2)
│       ├── package.json
│       ├── next.config.ts
│       └── src/app/
│           └── page.tsx          # "Coming soon — bot is the source of truth"
└── data/                     # gitignored: SQLite file, images, exports
    └── .gitkeep
```

**Why `packages/core` is non-negotiable:** every piece of business logic (streak math, TDEE, scan parsing, goal evaluation) lives there. The bot imports it. The future web app imports it. If you ever build a CLI, that imports it too. No drift, ever. Schema changes break consumers at compile time.

---

## Data Model

Drizzle schema in `packages/core/src/db/schema.ts`. All timestamps stored as Unix ms (integers) for portability; converted to dates at the edges.

**User**
- id (auto), telegramId (unique), name, sex, age, heightCm, activityLevel, createdAt
- startingWeightKg, currentWeightKg, targetWeightKg
- targetMode (`manual` | `ai` | `skipped`)
- timezone (IANA string)
- llmProvider, llmModel (nullable, only if AI mode)
- llmApiKeyEncrypted (nullable; AES-encrypted with `ENCRYPTION_KEY` from env)
- dndStart, dndEnd (default 22:30–06:30, stored as HH:MM strings)
- notificationMode (`quiet` | `standard` | `verbose`, default `verbose`)

**Target**
- userId (FK), dailyCalories, proteinG, carbsG, fatG
- targetBodyFatPct, targetMuscleMassKg (nullable)
- generatedBy (`user` | `ai` | `formula`), generatedAt
- rationale (nullable, only when generatedBy = `ai`)
- calorieWindowPct (default 10), proteinWindowPct (default 10)

**Meal**
- id, userId, timestamp, source (`manual` | `scan` | `text`)
- mealName, totalCalories, totalProteinG, totalCarbsG, totalFatG
- overallConfidence (nullable, only for scans)
- imagePath (nullable), userCorrected (bool, default false)

**MealItem**
- id, mealId (FK)
- foodName, estimatedQuantity, servingUnit
- calories, proteinG, carbsG, fatG
- confidence (nullable), notes (nullable)

**AnalysisLog** — raw Gemini output for audit and prompt iteration
- id, mealId (FK, nullable — log failed scans too)
- modelName, promptVersion
- rawAiOutput (text, JSON string), parsedOutput (text)
- errorMessage (nullable), createdAt

**BurnEntry** — separate from calorie budget
- id, userId, timestamp, activity, caloriesBurned, durationMin (nullable), notes

**WeightLog**
- id, userId, date (unique per user), weightKg, bodyFatPct (nullable), muscleMassKg (nullable)

**Goal** — v1 supports `weight` and `body_fat` only
- id, userId, type (`weight` | `body_fat`)
- targetValue, deadline (date), status (`active` | `hit` | `missed` | `abandoned`)
- reward (text, optional), punishment (text, optional)
- createdAt, resolvedAt (nullable)

**DailyResult** — computed at 23:55 local
- id, userId, date (unique per user)
- caloriesIn, caloriesBurned, proteinG
- calorieHit, proteinHit, streakHit (booleans)
- streakCountAfter (int)

**Note**
- id, userId, timestamp, content, tags (comma-separated string)

**ScanCount** — per-day rate limit counter
- userId, date (composite PK), count

---

## Streak Definition

A day "hits" when **both** are true:
- `caloriesIn` within ±`calorieWindowPct` of `target.dailyCalories` (default ±10%)
- `proteinG` ≥ `target.proteinG × (1 - proteinWindowPct/100)` (default ≥ 90%)

Burn entries do **not** affect this — target is fixed regardless of activity.

**One-strike break**: any miss resets streak to 0. No forgiveness, no rolling average.

Days with zero food logs count as a miss. No forget-to-log loophole.

Day boundary is **clock-based**: a meal logged at 23:50 counts toward that calendar day in the user's timezone. A meal logged at 00:01 the next day counts toward the next day.

---

## Onboarding Flow

Triggered on `/start` if user has no profile. Uses `@grammyjs/conversations` — a single async function, much cleaner than state machines.

Steps:
1. Welcome + ask name
2. Sex (inline keyboard: M/F)
3. Age
4. Height (cm)
5. Current weight (kg)
6. Target weight (kg)
7. Activity level — inline keyboard with one-line explanations:
   - Sedentary (desk job, no exercise)
   - Light (1–3 days/week)
   - Moderate (3–5 days/week)
   - Active (6–7 days/week)
   - Very active (2× per day, heavy training)
8. Timezone — try detect from Telegram `language_code` hint, else ask (IANA string like `Asia/Makassar`)
9. **TDEE suggestion (deterministic, runs locally):**
   - BMR (Mifflin-St Jeor):
     - Men: `10·kg + 6.25·cm − 5·age + 5`
     - Women: `10·kg + 6.25·cm − 5·age − 161`
   - Activity factor: 1.2 / 1.375 / 1.55 / 1.725 / 1.9
   - Show: "Your maintenance is ~X kcal/day. For your target weight, a 500 kcal deficit puts you at Y kcal/day."
10. Target mode picker:
    - **Manual** → ask each: daily calories, protein g, carbs g, fat g, target body fat % (optional), target muscle mass (optional)
    - **AI** → provider picker → paste API key → validate with ping → run target analysis with full onboarding context
    - **Skip for now** → save profile, leave targets null. Streak disabled until configured.
11. Confirm summary → save → schedule cron jobs (morning, 14:00 nudge, 22:00 goal check, Sunday body comp, 23:55 daily aggregate)

`@grammyjs/conversations` persists state automatically — a crash mid-onboarding doesn't lose progress. Each step has `/cancel`.

---

## Main Menu

After onboarding, `/menu` or any idle moment shows an inline keyboard:

```
🍽 Log food       📷 Scan food
🔥 Log burn       ⚖️ Log weight
📊 Today          📈 Week
🎯 Goals          📝 Note
📜 History        ⚙️ Settings
```

Commands also work directly:

| Command | Action |
|---|---|
| `/start` | Onboarding or welcome |
| `/menu` | Show main menu |
| `/scan` | Send a photo to log |
| `/today` | Today's totals vs target |
| `/week` | Last 7 days summary |
| `/history` | Last 10 meals |
| `/delete_last` | Undo last meal |
| `/weight` | Log today's weight |
| `/goals` | View/edit goals |
| `/note` | Free-form progress note |
| `/export` | Dump all data to JSON zip |
| `/settings` | Recalculate targets, change LLM, timezone, etc |
| `/cancel` | Bail out of any flow |

---

## Image Scan Flow

The scanner is the most error-prone surface. Image-based calorie estimation is approximate — a photo can't tell you hidden oil, sauce sugar, exact gram weights, or what's inside a mixed dish. The bot always frames results as estimates, never facts.

### Pipeline

```
User sends photo
   ↓
core.services.rateLimit.check(userId) → 'ok' | 'soft' | 'hard'
   ↓
Reply "🔍 Analyzing…"
   ↓
ctx.getFile() → file_path → download via fetch to /tmp
   ↓
core.services.gemini.scanFood(imagePath) → ZodValidated<ScanResult>
   ↓
Show confirmation card → Save / Edit / Discard (callback query)
   ↓
On save: insert Meal + MealItems + AnalysisLog, optionally copy image,
         reply with delta vs today's targets
```

### Gemini Prompt

Stored in `packages/core/src/prompts/food-scan-v1.txt`:

```
You are a food image analysis assistant. Analyze the provided food image
and estimate the visible foods and approximate portion sizes.

Rules:
- Return structured JSON only. No prose, no markdown fences.
- Do not claim exact calorie accuracy.
- Identify visible food items separately when possible.
- Estimate quantities using household units: cup, tbsp, tsp, gram estimate,
  piece, slice, bowl, plate, serving.
- Confidence is 0 to 1.
- Flag hidden ingredients: oil, butter, sugar, sauces, frying method.
- Recognize Indonesian/Southeast Asian dishes (nasi goreng, sambal, rendang,
  gado-gado, mie ayam, etc.) by name when applicable.
- Do not give medical or diet advice.
```

### Expected JSON Shape

```json
{
  "meal_name": "Nasi goreng with fried egg",
  "items": [
    {
      "food_name": "nasi goreng",
      "estimated_quantity": 1,
      "serving_unit": "plate",
      "visual_description": "medium plate of fried rice with visible oil sheen",
      "calories": 480,
      "protein_g": 12,
      "carbs_g": 65,
      "fat_g": 18,
      "confidence": 0.7,
      "notes": "oil content high based on sheen"
    }
  ],
  "totals": {
    "calories": 580,
    "protein_g": 18,
    "carbs_g": 66,
    "fat_g": 26
  },
  "overall_confidence": 0.68,
  "assumptions": ["no extra sauce unless visible", "portions estimated from plate"],
  "uncertainty_notes": ["hidden oil/sugar can shift calories ±30%"]
}
```

### Validation (Zod schema)

Defined in `packages/core/src/services/gemini.ts`:

```ts
const ScanResultSchema = z.object({
  meal_name: z.string().min(1),
  items: z.array(z.object({
    food_name: z.string().min(1),
    estimated_quantity: z.number().nonnegative(),
    serving_unit: z.string(),
    visual_description: z.string(),
    calories: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    notes: z.string().optional(),
  })).min(1),
  totals: z.object({ /* same numeric checks */ }),
  overall_confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()),
  uncertainty_notes: z.array(z.string()),
});
```

If parse fails → retry once with the same prompt + bad output appended and "fix the JSON". Still bad → "Couldn't read that one. Log it manually or try a clearer photo."

### Confirmation Card

```
🍽 Nasi goreng with fried egg
Confidence: medium (0.68)

• Nasi goreng — 1 plate
   480 kcal · 12P 65C 18F
• Fried egg — 1 piece
   100 kcal · 6P 1C 8F

Total: ~580 kcal · 18P 66C 26F

⚠️ Hidden oil/sugar can shift calories ±30%

[ ✅ Save ]  [ ✏️ Edit items ]  [ ❌ Discard ]
```

If `overall_confidence < 0.5` → highlight low-confidence items, prompt to confirm portions before showing Save.

### Edit Flow (Stage 2)

Inline buttons per item: ½, 1, 1.5, 2× current, or custom. Natural language replies accepted: `rice is 1.5 cups not 1`. For v1, just allow editing totals — full item-level editing waits.

### Storage

- Raw Gemini response → `AnalysisLog.rawAiOutput`, with `modelName` and `promptVersion`
- Parsed values → `Meal` + `MealItem`
- Image file → `./data/images/{userId}/{mealId}.jpg`, kept for replay during prompt iteration

### Why Not USDA Lookup

USDA coverage of Indonesian food is poor — "nasi goreng" and "sambal" have no clean matches. Adds a second API and a food-name normalization layer. Gemini's single-call estimates are good enough for trend tracking. Add USDA later if you want to ground specific Western foods.

---

## Scheduled Jobs

All jobs run in the user's timezone via `croner` (which handles tz natively). All jobs respect the DND window — anything that would fire inside DND is suppressed silently.

**Morning summary — daily at 07:00 local**
- Ask for today's weight (buttons: "Same as yesterday" / "Enter manually" / "Skip")
- After weight in: send yesterday's summary
  - Cals in / burn out / net
  - Macros vs target with traffic-light emoji
  - Weight delta
  - Streak status
- Show today's targets

**14:00 nudge — daily, only if zero meals logged today, verbose mode only**
- Short: "Haven't seen any meals today yet. Quick log?"
- Buttons: `📷 Scan` / `🍽 Log manually` / `🤫 Mute today`

**Sunday morning — 08:00**
- Morning summary as normal, then appends:
  > "Weekly body comp time. Drop your body fat % and muscle mass when you can."

**Daily aggregation — 23:55 local (silent)**
- Compute `DailyResult` for today
- Update streak counter
- Trigger goal evaluator

**Goal evaluator — 23:55 silent compute, surfaces at 22:00 next day**
- For each active goal: check deadline, mark hit/missed
- Pre-deadline pings: 30 days out, 7 days out, day-of

Job IDs keyed by `{userId}:{jobName}`. Croner schedules registered on startup by iterating users. If a user changes timezone or notification settings, their jobs are re-registered.

---

## Notification Modes

| Mode | Morning | 14:00 nudge | Sunday body comp | Goal pings | Action replies |
|---|---|---|---|---|---|
| Quiet | ✅ | ❌ | ❌ | ❌ | ✅ |
| Standard | ✅ | ❌ | ✅ | ✅ | ✅ |
| Verbose | ✅ | ✅ | ✅ | ✅ | ✅ |

DND window applies to all modes equally.

---

## Scan Rate Limiting

Soft cap at 15 scans/day, hard cap at 30.

- 15th scan → reply includes: "Heads up, you're at 15 scans today. Going hard on the food today huh."
- 30th scan → block: "Hit the daily scan cap. Use `/log` for manual entry, or scans reopen at midnight."
- Counter resets at 00:00 local

Per-user counts in `ScanCount` table. Caps configurable in `.env` and per-user override via `/settings`.

---

## Progress Views

### `/today`

```
📊 Today — Tue 26 May

🍽 Cals: 1480 / 2180  🟢 (-700)
🥩 Protein: 142g / 156g  🟢 (-14g)
🍞 Carbs: 156g / 220g  (-64g)
🥑 Fat: 48g / 68g  (-20g)

🔥 Burn: 320 kcal (60min lifting)
⚖️ Weight: 77.4 kg (-0.2 vs yesterday)

Streak: 5 days 🔥
```

Traffic-light per macro: 🟢 in window, 🟡 close, 🔴 outside, ⬜ no logs yet.

### `/week`

7-day bar chart, monospace HTML:

```
📈 Last 7 days

Wed 20 ████████░░ 1820/2180  🟢 ✓
Thu 21 ██████████ 2190/2180  🟢 ✓
Fri 22 ████████████ 2640/2180 🔴 ✗
Sat 23 ███████░░░ 1620/2180  🟡 ✗
Sun 24 █████████░ 1980/2180  🟢 ✓
Mon 25 █████████░ 2010/2180  🟢 ✓
Tue 26 ███████░░░ 1480/2180  🟡  (today, partial)

Avg: 1968 kcal · 4/6 hit days · current streak: 2
Weight: 78.1 → 77.4 (-0.7 kg)
```

Rendered with `<pre>` parse_mode=HTML for column alignment.

### Future views (v2 web)

- Heatmap calendar
- Proper line chart for weight
- Macro breakdown over time

These can stay rough in the bot. The web dashboard is where charts breathe.

---

## Goal Creation

`/goals` lands on list view. "➕ New goal" → type picker → guided creation.

### Weight Goal Flow

1. Type picker → "Weight"
2. Target weight (kg) — defaults from `User.targetWeightKg`
3. Deadline — auto-suggested:
   - Safe rate: 1% body weight per week (loss), 0.5% per week (gain)
   - Suggested date = today + `ceil(|delta| / (weight × rate))` weeks
   - Buttons: `✅ Use suggested` / `📅 Pick date` / `⚡ Aggressive (1.5×)`
4. Reward — free text, optional
5. Punishment — free text, optional
6. Confirm → save as `active`

Aggressive deadline triggers a warning (not a block):
> ⚠️ That's faster than the safe rate. You'll need a ~{N} kcal deficit. Some lean mass loss likely. Continue?

### Body Fat Goal Flow

Same shape, using 0.5–1% body fat per month as the safe rate baseline.

### Resolution

Resolved by the 23:55 goal evaluator. Next-morning summary surfaces the result. Resolved goals stay in `/goals` history under "📜 Past goals".

---

## Settings Menu

`/settings` opens a single message with inline keyboard. Every nav edits in place — max 2 levels deep.

```
⚙️ Settings

[ 👤 Profile ]        [ 🎯 Targets ]
[ 🔔 Notifications ]  [ 🌙 DND window ]
[ 🌏 Timezone ]       [ 🤖 LLM ]
[ 📊 Streak windows ] [ 📷 Scan limits ]
[ 📤 Export data ]    [ 🗑 Reset ]
```

### 👤 Profile
- Name, sex, age, height, current weight, target weight, activity level
- Changing weight/age/activity offers: "Recalculate targets?"

### 🎯 Targets
- View current daily calories, macros, body fat target, muscle mass target, rationale
- `✏️ Edit manually` / `🤖 Regenerate with AI` / `📐 Use formula` / `👀 Show AI rationale`

### 🔔 Notifications
- Mode picker: `Quiet` / `Standard` / `Verbose`
- Toggle per job
- Time tweaks: morning (default 07:00), nudge (default 14:00)

### 🌙 DND window
- Start and end (HH:MM), default 22:30–06:30

### 🌏 Timezone
- IANA string, validated against `Intl.supportedValuesOf('timeZone')`
- Re-registers all cron jobs on save

### 🤖 LLM
- Provider, model, masked API key
- `Test connection` button — runs ping call

### 📊 Streak windows
- `calorieWindowPct` and `proteinWindowPct`
- Live preview: "At your current target, a hit day means 1962–2398 kcal and ≥140g protein."

### 📷 Scan limits
- Soft and hard caps, per-user override

### 📤 Export data
- Same as `/export` with checkboxes

### 🗑 Reset
- `Targets only` / `Goals only` / `All meal history` / `Nuke everything`
- Typed confirmation (`yes nuke`) for full reset
- Profile auto-exported before nuke

---

## Rewards & Punishments

Stored as `reward` and `punishment` text fields on `Goal`. No separate table.

- ✅ **Hit** → "Goal hit: {target}. You earned: {reward}"
- ❌ **Missed** → "Goal missed: {target} by {delta}. Punishment: {punishment}"

Empty fields → just send result without those lines.

---

## Error Handling & Voice

Casual and honest. Not corporate, not apologetic.

### Voice rules

- No "Sorry," / "Oops!" / "Oh no!"
- No "Please try again later" — say *why* and *when* if known
- No error codes or stack traces in user-facing messages
- Name the failing component when useful: "Gemini" / "Telegram" / "the database"
- If retry helps, offer a button
- One line is usually enough

### Standard messages

| Situation | Message |
|---|---|
| Gemini timeout / 5xx | "Gemini's being slow. Try again? [🔄 Retry]" |
| Gemini returned junk after retry | "Couldn't read that one. Log it manually or try a clearer photo." |
| Gemini rate limited | "Gemini hit a rate limit. Wait a minute and retry." |
| Invalid API key on save | "That key didn't validate. Double-check it." |
| Telegram file download failed | "Couldn't grab the photo from Telegram. Resend it?" |
| DB write failed | "Save failed on my end. Try once more, then check the logs if it keeps happening." |
| Image too large | "Photo's too big (>{N}MB). Compress and resend." |
| Scan hard limit hit | "Hit the daily scan cap ({N}). Use `/log` for manual entry, or scans reopen at midnight." |
| Invalid input during onboarding | "That doesn't look like a number. Try again, or `/cancel`." |
| Unknown command | "Don't know that one. Try `/menu`." |
| Unhandled exception | "Something broke. Logged it. Try again, or `/menu` to start fresh." |

### Logging

Structured JSON to stdout via `pino`. journald collects.

Every user-facing error gets a server-side log line with full stack trace, prompt version, userId, request payload.

For Gemini failures: raw response goes into `AnalysisLog` with `errorMessage` populated.

---

## AI Target Analysis (optional path)

If user picks `ai` during onboarding (or runs `/settings → Recalculate targets`):

### Flow

1. Validate API key with cheap ping call
2. Build request with system instruction + user profile JSON
3. Validate response against Zod schema — retry once on parse failure
4. Show targets with rationale → "Use these / Edit / Discard"
5. On accept: insert into `Target` with `generatedBy="ai"` and `rationale` populated

### System Instruction (`packages/core/src/prompts/target-analysis-v1.txt`)

```
You are a fitness target advisor. Given the user's body data, activity level,
and goal, recommend daily calorie and macronutrient targets.

Rules:
- Return structured JSON only. No prose, no markdown fences.
- Use Mifflin-St Jeor for BMR, then apply activity multiplier for TDEE.
- For weight loss: 300–700 kcal/day deficit. Cap at 1% body weight loss per week.
- For weight gain (lean): 200–400 kcal/day surplus. Cap at 0.5% per week.
- Protein: 1.6–2.2 g/kg body weight, higher end if in deficit.
- Fat: minimum 0.6 g/kg body weight, typically 25–35% of calories.
- Carbs: remainder.
- Do not give medical or diet advice. No "consult a doctor" disclaimers.
- Be honest about uncertainty. If unrealistic, flag it.
```

### Request Payload

```json
{
  "sex": "M",
  "age": 24,
  "height_cm": 175,
  "current_weight_kg": 78,
  "target_weight_kg": 72,
  "activity_level": "moderate",
  "deadline_weeks": 12,
  "aggressiveness": "moderate",
  "current_body_fat_pct": 18,
  "target_body_fat_pct": 12
}
```

### Expected JSON Response

```json
{
  "tdee_kcal": 2680,
  "daily_calories": 2180,
  "deficit_or_surplus_kcal": -500,
  "protein_g": 156,
  "carbs_g": 220,
  "fat_g": 68,
  "macro_split_pct": { "protein": 29, "carbs": 40, "fat": 31 },
  "weekly_weight_change_kg": -0.5,
  "target_body_fat_pct": 12,
  "target_muscle_mass_kg": null,
  "timeline_realistic": true,
  "rationale": "BMR ~1730 kcal via Mifflin-St Jeor, TDEE ~2680 with moderate activity (1.55x). 500 kcal deficit yields ~0.5 kg/week loss, which is ~0.6% body weight — sustainable. Protein at 2.0 g/kg supports muscle retention in deficit. Timeline of 12 weeks for 6 kg loss is realistic at this rate.",
  "warnings": []
}
```

### Validation (Zod)

- All numeric fields non-negative
- `daily_calories` between 1200 and 4500
- `protein_g + carbs_g + fat_g` macros sum to `daily_calories` within ±5% (4/4/9 kcal/g)
- `macro_split_pct` sums to 100 ±2
- `rationale` non-empty, under 500 chars

Retry once on failure. Still bad → fall back to formula-based via `nutrition.ts`.

### Storage

Rationale on Target row. Surfaced via `/settings → View targets → Show rationale`.

---

## .env

```
# Required
TELEGRAM_BOT_TOKEN=
GEMINI_API_KEY=                    # vision (required) + default AI mode

# AES key for encrypting user-provided API keys at rest
ENCRYPTION_KEY=                    # 32-byte hex; generate with: openssl rand -hex 32

# Optional — user-configurable AI target mode (key is in DB, encrypted)
USER_LLM_PROVIDER=gemini
USER_LLM_MODEL=

# Storage
DB_PATH=./data/nerif.db
IMAGES_DIR=./data/images           # empty to skip image storage

# Rate limits
SCAN_SOFT_LIMIT=15
SCAN_HARD_LIMIT=30

# Scheduling defaults (per-user can override)
DEFAULT_DND_START=22:30
DEFAULT_DND_END=06:30

# Ops
LOG_LEVEL=info
PROMPT_VERSION=v1
NODE_ENV=production
```

Timezone is **not** in env — stored per-user in DB.

---

## Export

`/export` runs a full data dump and sends it as a zip via Telegram document upload.

Format:
```
nerif-export-{userId}-{YYYYMMDD-HHMMSS}.zip
├── user.json
├── targets.json
├── meals.json              # joined with meal_items
├── burn_entries.json
├── weight_logs.json
├── goals.json
├── daily_results.json
├── notes.json
└── analysis_logs.json      # optional, large; flag --no-logs to skip
```

Plain JSON, ISO-8601 timestamps. Images excluded by default; `/export --with-images` includes them.

---

## Build Order

Each step ships a working bot before moving on.

1. **Scaffold** — Turborepo, Bun workspaces, `packages/core` schema, Drizzle migrations work (`bun run db:push`)
2. **Bot bootstrap** — grammY app starts, `/start` welcomes, structured logging
3. **Onboarding** — full conversation, manual targets + TDEE suggestion + skip option. No AI mode yet.
4. **Manual logging** — `/log`, `/burn`, `/weight`, `/note`, `/delete_last`, `/history`
5. **Today/week** — read paths, traffic-light formatting, streak math
6. **Image scan** — Gemini integration, Zod validation, retry-once, confirmation card
7. **Scheduler** — croner setup, all jobs, DND enforcement
8. **Goals** — weight + body fat types, deadline pings, reward/punishment
9. **AI target mode** — last, most variable
10. **Polish** — error handling, retry logic, `/export`, rate limiting
11. **Web foundation (v2 entry)** — `packages/web` scaffolded with `core` imports, Telegram auth, read-only dashboard

Don't stack incomplete features.

---

## Deploy

### Bot (v1)

Same VPS as your other agents. Docker Compose:

```yaml
services:
  bot:
    build: .
    container_name: nerif
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./data:/app/data
```

Bun runs the bot directly. Polling (no inbound traffic), logs to stdout, journald collects.

### Web (v2, later)

Two options when you build it:
1. **Same VPS, Nginx routing** — `nerif.yourdomain.com` proxies to a `web` service running Next.js. Same compose file, second service.
2. **Vercel** — push `packages/web` separately. Requires Postgres swap (Vercel can't reach SQLite on your VPS). Drizzle abstracts this — connection string + driver change.

For v1, neither matters. The point of `packages/core` is to keep both doors open.

---

## Future (not v1)

- **Web dashboard** (v2 — already structured for it)
- Wearable integration (Apple Health export, Whoop)
- Auto burn estimation from logged activities
- Photo-based body progress tracking (monthly mirror selfies → Gemini diff)
- Voice notes → Whisper → structured log
- Postgres migration (Drizzle abstracts it)
- Multi-user (already structured for it; just enable per-user data scoping in middleware)

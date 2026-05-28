import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "../db/schema";
import { users, targets, meals, dailyResults } from "../db/schema";
import { aggregateDaily } from "../services/daily";
import { toUtcBounds } from "../date";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  sqlite.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sex TEXT NOT NULL,
    age INTEGER NOT NULL,
    height_cm REAL NOT NULL,
    activity_level TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    starting_weight_kg REAL NOT NULL,
    current_weight_kg REAL NOT NULL,
    target_weight_kg REAL NOT NULL,
    target_mode TEXT NOT NULL,
    timezone TEXT NOT NULL,
    llm_provider TEXT,
    llm_model TEXT,
    llm_api_key_encrypted TEXT,
    dnd_start TEXT NOT NULL DEFAULT '22:30',
    dnd_end TEXT NOT NULL DEFAULT '06:30',
    notification_mode TEXT NOT NULL DEFAULT 'verbose',
    scan_soft_limit INTEGER,
    scan_hard_limit INTEGER
  )`);
  sqlite.run(`CREATE TABLE targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    daily_calories INTEGER NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    target_body_fat_pct REAL,
    target_muscle_mass_kg REAL,
    generated_by TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    rationale TEXT,
    calorie_window_pct REAL NOT NULL DEFAULT 10,
    protein_window_pct REAL NOT NULL DEFAULT 10
  )`);
  sqlite.run(`CREATE TABLE meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,
    source TEXT NOT NULL,
    meal_name TEXT NOT NULL,
    total_calories REAL NOT NULL,
    total_protein_g REAL NOT NULL,
    total_carbs_g REAL NOT NULL,
    total_fat_g REAL NOT NULL,
    overall_confidence REAL,
    image_path TEXT,
    user_corrected INTEGER NOT NULL DEFAULT 0
  )`);
  sqlite.run(`CREATE TABLE burn_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,
    activity TEXT NOT NULL,
    calories_burned REAL NOT NULL,
    duration_min REAL,
    notes TEXT
  )`);
  sqlite.run(`CREATE TABLE daily_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    calories_in REAL NOT NULL,
    calories_burned REAL NOT NULL,
    protein_g REAL NOT NULL,
    calorie_hit INTEGER NOT NULL,
    protein_hit INTEGER NOT NULL,
    streak_hit INTEGER NOT NULL,
    streak_count_after INTEGER NOT NULL
  )`);
  sqlite.run(`CREATE UNIQUE INDEX daily_results_user_date_idx ON daily_results(user_id, date)`);

  return drizzle(sqlite, { schema });
}

async function insertUser(db: ReturnType<typeof createTestDb>, overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      telegramId: "12345",
      name: "Test",
      sex: "M",
      age: 25,
      heightCm: 175,
      activityLevel: "moderate",
      startingWeightKg: 80,
      currentWeightKg: 80,
      targetWeightKg: 75,
      targetMode: "manual",
      timezone: "UTC",
      ...overrides,
    })
    .returning();
  return user!;
}

async function insertTarget(db: ReturnType<typeof createTestDb>, userId: number) {
  await db.insert(targets).values({
    userId,
    dailyCalories: 2000,
    proteinG: 150,
    carbsG: 200,
    fatG: 65,
    generatedBy: "formula",
  });
}

async function insertMeal(
  db: ReturnType<typeof createTestDb>,
  userId: number,
  timestamp: number,
  opts: { cal?: number; prot?: number } = {},
) {
  await db.insert(meals).values({
    userId,
    timestamp,
    source: "manual",
    mealName: "test meal",
    totalCalories: opts.cal ?? 500,
    totalProteinG: opts.prot ?? 40,
    totalCarbsG: 50,
    totalFatG: 15,
  });
}

describe("aggregateDaily", () => {
  it("returns null when no target exists", async () => {
    const db = createTestDb();
    const user = await insertUser(db);

    const result = await aggregateDaily({
      db, userId: user.id, timezone: "UTC", date: "2026-05-28",
    });

    expect(result).toBeNull();
  });

  it("computes zero totals when no meals or burns logged", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertTarget(db, user.id);

    const result = await aggregateDaily({
      db, userId: user.id, timezone: "UTC", date: "2026-05-28",
    });

    expect(result).not.toBeNull();
    expect(result!.caloriesIn).toBe(0);
    expect(result!.caloriesBurned).toBe(0);
    expect(result!.proteinG).toBe(0);
    expect(result!.streakHit).toBe(false);
    expect(result!.streakCountAfter).toBe(0);
  });

  it("sums meals within the correct UTC bounds for a timezone", async () => {
    const db = createTestDb();
    const user = await insertUser(db, { timezone: "Asia/Makassar" }); // UTC+8
    await insertTarget(db, user.id);

    // 2026-05-28 in Makassar = 2026-05-27T16:00:00Z .. 2026-05-28T16:00:00Z
    // Meal at 2026-05-28T02:00Z = 2026-05-28T10:00+08:00 (within bounds)
    await insertMeal(db, user.id, new Date("2026-05-28T02:00:00Z").getTime(), { cal: 600, prot: 50 });
    // Meal at 2026-05-27T15:00Z = 2026-05-27T23:00+08:00 (before bounds)
    await insertMeal(db, user.id, new Date("2026-05-27T15:00:00Z").getTime(), { cal: 999, prot: 99 });

    const result = await aggregateDaily({
      db, userId: user.id, timezone: "Asia/Makassar", date: "2026-05-28",
    });

    expect(result!.caloriesIn).toBe(600);
    expect(result!.proteinG).toBe(50);
  });

  it("correctly evaluates a streak hit", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertTarget(db, user.id);

    // Target: 2000 kcal, 150g protein. 10% windows → 1800-2200, 135g+
    const { start } = toUtcBounds("2026-05-28", "UTC");
    await insertMeal(db, user.id, start + 3600000, { cal: 2000, prot: 150 });

    const result = await aggregateDaily({
      db, userId: user.id, timezone: "UTC", date: "2026-05-28",
    });

    expect(result!.streakHit).toBe(true);
    expect(result!.calorieHit).toBe(true);
    expect(result!.proteinHit).toBe(true);
    expect(result!.streakCountAfter).toBe(1);
  });

  it("carries streak from previous day", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertTarget(db, user.id);

    // Yesterday's daily result with streak count 3
    await db.insert(dailyResults).values({
      userId: user.id,
      date: "2026-05-27",
      caloriesIn: 2000,
      caloriesBurned: 0,
      proteinG: 150,
      calorieHit: true,
      proteinHit: true,
      streakHit: true,
      streakCountAfter: 3,
    });

    // Today: also a hit
    const { start } = toUtcBounds("2026-05-28", "UTC");
    await insertMeal(db, user.id, start + 3600000, { cal: 2000, prot: 150 });

    const result = await aggregateDaily({
      db, userId: user.id, timezone: "UTC", date: "2026-05-28",
    });

    expect(result!.streakHit).toBe(true);
    expect(result!.streakCountAfter).toBe(4);
  });

  it("resets streak on miss", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertTarget(db, user.id);

    // Yesterday: streak at 5
    await db.insert(dailyResults).values({
      userId: user.id,
      date: "2026-05-27",
      caloriesIn: 2000,
      caloriesBurned: 0,
      proteinG: 150,
      calorieHit: true,
      proteinHit: true,
      streakHit: true,
      streakCountAfter: 5,
    });

    // Today: way off target
    const { start } = toUtcBounds("2026-05-28", "UTC");
    await insertMeal(db, user.id, start + 3600000, { cal: 500, prot: 10 });

    const result = await aggregateDaily({
      db, userId: user.id, timezone: "UTC", date: "2026-05-28",
    });

    expect(result!.streakHit).toBe(false);
    expect(result!.streakCountAfter).toBe(0);
  });

  it("upserts daily_results on second call", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertTarget(db, user.id);

    const { start } = toUtcBounds("2026-05-28", "UTC");
    await insertMeal(db, user.id, start + 3600000, { cal: 500, prot: 10 });

    await aggregateDaily({ db, userId: user.id, timezone: "UTC", date: "2026-05-28" });

    // Add another meal
    await insertMeal(db, user.id, start + 7200000, { cal: 1500, prot: 140 });

    const result = await aggregateDaily({ db, userId: user.id, timezone: "UTC", date: "2026-05-28" });

    expect(result!.caloriesIn).toBe(2000);
    expect(result!.proteinG).toBe(150);
    expect(result!.streakHit).toBe(true);

    // Should only have one row
    const rows = await db.select().from(dailyResults);
    expect(rows).toHaveLength(1);
  });
});

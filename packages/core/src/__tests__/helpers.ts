import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "../db/schema";
import {
  users,
  targets,
  meals,
  mealItems,
  analysisLogs,
  burnEntries,
  weightLogs,
  goals,
  dailyResults,
  notes,
  scanCounts,
} from "../db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export function createTestDb(): TestDb {
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

  sqlite.run(`CREATE TABLE meal_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    food_name TEXT NOT NULL,
    estimated_quantity REAL NOT NULL,
    serving_unit TEXT NOT NULL,
    calories REAL NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    confidence REAL,
    notes TEXT
  )`);

  sqlite.run(`CREATE TABLE analysis_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    meal_id INTEGER REFERENCES meals(id) ON DELETE SET NULL,
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    raw_ai_output TEXT NOT NULL,
    parsed_output TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL
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

  sqlite.run(`CREATE TABLE weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    body_fat_pct REAL,
    muscle_mass_kg REAL
  )`);
  sqlite.run(`CREATE UNIQUE INDEX weight_logs_user_date_idx ON weight_logs(user_id, date)`);

  sqlite.run(`CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    target_value REAL NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    reward TEXT,
    punishment TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
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

  sqlite.run(`CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timestamp INTEGER NOT NULL,
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT ''
  )`);

  sqlite.run(`CREATE TABLE scan_counts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  )`);

  return drizzle(sqlite, { schema });
}

export async function insertUser(
  db: TestDb,
  overrides: Partial<typeof users.$inferInsert> = {},
) {
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

export async function insertTarget(db: TestDb, userId: number) {
  const [t] = await db
    .insert(targets)
    .values({
      userId,
      dailyCalories: 2000,
      proteinG: 150,
      carbsG: 200,
      fatG: 65,
      generatedBy: "formula",
    })
    .returning();
  return t!;
}

export async function insertMeal(
  db: TestDb,
  userId: number,
  timestamp: number,
  opts: { cal?: number; prot?: number; carbs?: number; fat?: number; imagePath?: string } = {},
) {
  const [meal] = await db
    .insert(meals)
    .values({
      userId,
      timestamp,
      source: "manual",
      mealName: "test meal",
      totalCalories: opts.cal ?? 500,
      totalProteinG: opts.prot ?? 40,
      totalCarbsG: opts.carbs ?? 50,
      totalFatG: opts.fat ?? 15,
      imagePath: opts.imagePath ?? null,
    })
    .returning();
  return meal!;
}

export async function insertAnalysisLog(
  db: TestDb,
  opts: { userId?: number | null; mealId?: number | null; errorMessage?: string },
) {
  const [log] = await db
    .insert(analysisLogs)
    .values({
      userId: opts.userId ?? null,
      mealId: opts.mealId ?? null,
      modelName: "gemini-2.5-flash",
      promptVersion: "v1",
      rawAiOutput: "raw output",
      errorMessage: opts.errorMessage ?? null,
    })
    .returning();
  return log!;
}

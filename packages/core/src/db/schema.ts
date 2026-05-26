import { relations } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const activityLevels = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  telegramId: text("telegram_id").notNull().unique(),
  name: text("name").notNull(),
  sex: text("sex", { enum: ["M", "F"] }).notNull(),
  age: integer("age").notNull(),
  heightCm: real("height_cm").notNull(),
  activityLevel: text("activity_level", { enum: activityLevels }).notNull(),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  startingWeightKg: real("starting_weight_kg").notNull(),
  currentWeightKg: real("current_weight_kg").notNull(),
  targetWeightKg: real("target_weight_kg").notNull(),
  targetMode: text("target_mode", {
    enum: ["manual", "ai", "skipped"],
  }).notNull(),
  timezone: text("timezone").notNull(),
  llmProvider: text("llm_provider"),
  llmModel: text("llm_model"),
  llmApiKeyEncrypted: text("llm_api_key_encrypted"),
  dndStart: text("dnd_start").notNull().default("22:30"),
  dndEnd: text("dnd_end").notNull().default("06:30"),
  notificationMode: text("notification_mode", {
    enum: ["quiet", "standard", "verbose"],
  })
    .notNull()
    .default("verbose"),
  scanSoftLimit: integer("scan_soft_limit"),
  scanHardLimit: integer("scan_hard_limit"),
});

export const targets = sqliteTable("targets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyCalories: integer("daily_calories").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  targetBodyFatPct: real("target_body_fat_pct"),
  targetMuscleMassKg: real("target_muscle_mass_kg"),
  generatedBy: text("generated_by", {
    enum: ["user", "ai", "formula"],
  }).notNull(),
  generatedAt: integer("generated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  rationale: text("rationale"),
  calorieWindowPct: real("calorie_window_pct").notNull().default(10),
  proteinWindowPct: real("protein_window_pct").notNull().default(10),
});

export const meals = sqliteTable("meals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp").notNull(),
  source: text("source", { enum: ["manual", "scan", "text"] }).notNull(),
  mealName: text("meal_name").notNull(),
  totalCalories: real("total_calories").notNull(),
  totalProteinG: real("total_protein_g").notNull(),
  totalCarbsG: real("total_carbs_g").notNull(),
  totalFatG: real("total_fat_g").notNull(),
  overallConfidence: real("overall_confidence"),
  imagePath: text("image_path"),
  userCorrected: integer("user_corrected", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const mealItems = sqliteTable("meal_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealId: integer("meal_id")
    .notNull()
    .references(() => meals.id, { onDelete: "cascade" }),
  foodName: text("food_name").notNull(),
  estimatedQuantity: real("estimated_quantity").notNull(),
  servingUnit: text("serving_unit").notNull(),
  calories: real("calories").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  confidence: real("confidence"),
  notes: text("notes"),
});

export const analysisLogs = sqliteTable("analysis_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealId: integer("meal_id").references(() => meals.id, { onDelete: "set null" }),
  modelName: text("model_name").notNull(),
  promptVersion: text("prompt_version").notNull(),
  rawAiOutput: text("raw_ai_output").notNull(),
  parsedOutput: text("parsed_output"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const burnEntries = sqliteTable("burn_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp").notNull(),
  activity: text("activity").notNull(),
  caloriesBurned: real("calories_burned").notNull(),
  durationMin: real("duration_min"),
  notes: text("notes"),
});

export const weightLogs = sqliteTable(
  "weight_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    bodyFatPct: real("body_fat_pct"),
    muscleMassKg: real("muscle_mass_kg"),
  },
  (table) => ({
    userDateIdx: uniqueIndex("weight_logs_user_date_idx").on(
      table.userId,
      table.date,
    ),
  }),
);

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["weight", "body_fat"] }).notNull(),
  targetValue: real("target_value").notNull(),
  deadline: text("deadline").notNull(),
  status: text("status", {
    enum: ["active", "hit", "missed", "abandoned"],
  })
    .notNull()
    .default("active"),
  reward: text("reward"),
  punishment: text("punishment"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  resolvedAt: integer("resolved_at"),
});

export const dailyResults = sqliteTable(
  "daily_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    caloriesIn: real("calories_in").notNull(),
    caloriesBurned: real("calories_burned").notNull(),
    proteinG: real("protein_g").notNull(),
    calorieHit: integer("calorie_hit", { mode: "boolean" }).notNull(),
    proteinHit: integer("protein_hit", { mode: "boolean" }).notNull(),
    streakHit: integer("streak_hit", { mode: "boolean" }).notNull(),
    streakCountAfter: integer("streak_count_after").notNull(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("daily_results_user_date_idx").on(
      table.userId,
      table.date,
    ),
  }),
);

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp").notNull(),
  content: text("content").notNull(),
  tags: text("tags").notNull().default(""),
});

export const scanCounts = sqliteTable(
  "scan_counts",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.date] }),
  }),
);

export const userRelations = relations(users, ({ many }) => ({
  targets: many(targets),
  meals: many(meals),
  burnEntries: many(burnEntries),
  weightLogs: many(weightLogs),
  goals: many(goals),
  dailyResults: many(dailyResults),
  notes: many(notes),
}));

export const mealRelations = relations(meals, ({ many, one }) => ({
  user: one(users, {
    fields: [meals.userId],
    references: [users.id],
  }),
  items: many(mealItems),
  analysisLogs: many(analysisLogs),
}));

export const mealItemRelations = relations(mealItems, ({ one }) => ({
  meal: one(meals, {
    fields: [mealItems.mealId],
    references: [meals.id],
  }),
}));

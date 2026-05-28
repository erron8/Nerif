import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { NerifDb } from "../db/client";
import {
  burnEntries,
  dailyResults,
  meals,
  targets,
  users,
} from "../db/schema";
import { evaluateDailyHit, nextStreakCount } from "./streak";
import { localDateString, toUtcBounds } from "../date";

export interface DailyAggregationInput {
  db: NerifDb;
  userId: number;
  timezone: string;
  date: string; // YYYY-MM-DD in the user's local timezone
}

export interface DailyAggregationResult {
  caloriesIn: number;
  caloriesBurned: number;
  proteinG: number;
  calorieHit: boolean;
  proteinHit: boolean;
  streakHit: boolean;
  streakCountAfter: number;
}

/**
 * Compute daily totals for a user on a given date, evaluate streak,
 * and upsert into daily_results. Returns the aggregation result.
 */
export async function aggregateDaily(
  input: DailyAggregationInput,
): Promise<DailyAggregationResult | null> {
  const { db, userId, timezone, date } = input;
  const { start: dayStart, end: dayEnd } = toUtcBounds(date, timezone);

  // Sum meals for the day (exclusive end bound)
  const mealRows = await db
    .select({
      cal: sql<number>`coalesce(sum(${meals.totalCalories}), 0)`,
      prot: sql<number>`coalesce(sum(${meals.totalProteinG}), 0)`,
    })
    .from(meals)
    .where(
      and(
        eq(meals.userId, userId),
        gte(meals.timestamp, dayStart),
        lt(meals.timestamp, dayEnd),
      ),
    );

  const caloriesIn = Math.round(mealRows[0]?.cal ?? 0);
  const proteinG = Math.round(mealRows[0]?.prot ?? 0);

  // Sum burn for the day
  const burnRows = await db
    .select({
      burned: sql<number>`coalesce(sum(${burnEntries.caloriesBurned}), 0)`,
    })
    .from(burnEntries)
    .where(
      and(
        eq(burnEntries.userId, userId),
        gte(burnEntries.timestamp, dayStart),
        lt(burnEntries.timestamp, dayEnd),
      ),
    );
  const caloriesBurned = Math.round(burnRows[0]?.burned ?? 0);

  // Get active target
  const [target] = await db
    .select()
    .from(targets)
    .where(eq(targets.userId, userId))
    .orderBy(desc(targets.generatedAt))
    .limit(1);

  if (!target) {
    return null;
  }

  // Evaluate streak hit
  const hit = evaluateDailyHit(
    {
      dailyCalories: target.dailyCalories,
      proteinG: target.proteinG,
      carbsG: target.carbsG,
      fatG: target.fatG,
    },
    { caloriesIn, caloriesBurned, proteinG },
    {
      calorieWindowPct: target.calorieWindowPct,
      proteinWindowPct: target.proteinWindowPct,
    },
  );

  // Get yesterday's streak count — compute yesterday's date in user timezone
  const dateObj = new Date(`${date}T12:00:00Z`);
  dateObj.setUTCDate(dateObj.getUTCDate() - 1);
  const yDate = localDateString(dateObj, timezone);

  const [prev] = await db
    .select()
    .from(dailyResults)
    .where(
      and(eq(dailyResults.userId, userId), eq(dailyResults.date, yDate)),
    )
    .limit(1);

  const prevStreak = prev?.streakCountAfter ?? 0;
  const streakCountAfter = nextStreakCount(prevStreak, hit.streakHit);

  // Upsert daily result
  const [existing] = await db
    .select()
    .from(dailyResults)
    .where(
      and(eq(dailyResults.userId, userId), eq(dailyResults.date, date)),
    )
    .limit(1);

  const row = {
    userId,
    date,
    caloriesIn,
    caloriesBurned,
    proteinG,
    calorieHit: hit.calorieHit,
    proteinHit: hit.proteinHit,
    streakHit: hit.streakHit,
    streakCountAfter,
  };

  if (existing) {
    await db
      .update(dailyResults)
      .set(row)
      .where(eq(dailyResults.id, existing.id));
  } else {
    await db.insert(dailyResults).values(row);
  }

  return {
    caloriesIn,
    caloriesBurned,
    proteinG,
    calorieHit: hit.calorieHit,
    proteinHit: hit.proteinHit,
    streakHit: hit.streakHit,
    streakCountAfter,
  };
}

/**
 * Run aggregation for a single user for their local "today".
 */
export async function aggregateUserToday(
  db: NerifDb,
  user: typeof users.$inferSelect,
): Promise<DailyAggregationResult | null> {
  const today = localDateString(new Date(), user.timezone);
  return aggregateDaily({ db, userId: user.id, timezone: user.timezone, date: today });
}

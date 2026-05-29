import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";

import {
  users,
  meals,
  analysisLogs,
  mealItems,
  burnEntries,
  weightLogs,
  targets,
  dailyResults,
} from "@nerif/core";

import { createTestDb, insertUser, insertMeal, insertAnalysisLog, insertTarget } from "./helpers";

describe("reset cascade: user deletion", () => {
  it("cascades to meals when user is deleted", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertMeal(db, user.id, Date.now());

    await db.delete(users).where(eq(users.id, user.id));

    const remainingMeals = await db.select().from(meals);
    expect(remainingMeals).toHaveLength(0);
  });

  it("cascades to meal_items when user is deleted", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    const meal = await insertMeal(db, user.id, Date.now());
    await db.insert(mealItems).values({
      mealId: meal.id,
      foodName: "chicken",
      estimatedQuantity: 1,
      servingUnit: "serving",
      calories: 200,
      proteinG: 30,
      carbsG: 10,
      fatG: 5,
    });

    await db.delete(users).where(eq(users.id, user.id));

    const remainingItems = await db.select().from(mealItems);
    expect(remainingItems).toHaveLength(0);
  });

  it("cascades to analysis_logs via userId FK", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    // Orphaned log (no mealId) but has userId
    await insertAnalysisLog(db, { userId: user.id, mealId: null, errorMessage: "parse failed" });

    await db.delete(users).where(eq(users.id, user.id));

    const remainingLogs = await db.select().from(analysisLogs);
    expect(remainingLogs).toHaveLength(0);
  });

  it("cascades to analysis_logs linked to meals via userId", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    const meal = await insertMeal(db, user.id, Date.now());
    await insertAnalysisLog(db, { userId: user.id, mealId: meal.id });

    await db.delete(users).where(eq(users.id, user.id));

    const remainingLogs = await db.select().from(analysisLogs);
    expect(remainingLogs).toHaveLength(0);
  });

  it("cascades to burn_entries, weight_logs, targets, daily_results", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertTarget(db, user.id);
    await db.insert(burnEntries).values({
      userId: user.id,
      timestamp: Date.now(),
      activity: "running",
      caloriesBurned: 300,
    });
    await db.insert(weightLogs).values({
      userId: user.id,
      date: "2026-05-29",
      weightKg: 80,
    });
    await db.insert(dailyResults).values({
      userId: user.id,
      date: "2026-05-29",
      caloriesIn: 2000,
      caloriesBurned: 300,
      proteinG: 150,
      calorieHit: true,
      proteinHit: true,
      streakHit: true,
      streakCountAfter: 1,
    });

    await db.delete(users).where(eq(users.id, user.id));

    expect(await db.select().from(burnEntries)).toHaveLength(0);
    expect(await db.select().from(weightLogs)).toHaveLength(0);
    expect(await db.select().from(targets)).toHaveLength(0);
    expect(await db.select().from(dailyResults)).toHaveLength(0);
  });
});

describe("analysis_logs userId cleanup", () => {
  it("deletes orphaned analysis logs by userId (failed scan, no mealId)", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await insertAnalysisLog(db, { userId: user.id, mealId: null, errorMessage: "Gemini failed" });
    await insertAnalysisLog(db, { userId: user.id, mealId: null, errorMessage: "timeout" });

    const before = await db.select().from(analysisLogs);
    expect(before).toHaveLength(2);

    // Simulate what the reset handler does: delete by userId
    await db.delete(analysisLogs).where(eq(analysisLogs.userId, user.id));

    const after = await db.select().from(analysisLogs);
    expect(after).toHaveLength(0);
  });

  it("deletes meal-linked analysis logs by userId", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    const meal = await insertMeal(db, user.id, Date.now());
    await insertAnalysisLog(db, { userId: user.id, mealId: meal.id });

    await db.delete(analysisLogs).where(eq(analysisLogs.userId, user.id));

    const remaining = await db.select().from(analysisLogs);
    expect(remaining).toHaveLength(0);
  });

  it("only deletes logs for the target user, not other users", async () => {
    const db = createTestDb();
    const user1 = await insertUser(db, { telegramId: "111" });
    const user2 = await insertUser(db, { telegramId: "222" });
    await insertAnalysisLog(db, { userId: user1.id, mealId: null, errorMessage: "fail" });
    await insertAnalysisLog(db, { userId: user2.id, mealId: null, errorMessage: "fail" });

    await db.delete(analysisLogs).where(eq(analysisLogs.userId, user1.id));

    const remaining = await db.select().from(analysisLogs);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.userId).toBe(user2.id);
  });
});

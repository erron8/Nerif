import { describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";

import { analysisLogs, meals } from "@nerif/core";

import { createTestDb, insertUser, insertMeal, insertAnalysisLog } from "./helpers";

describe("scan failure logging with userId", () => {
  it("inserts failed scan log with userId and no mealId", async () => {
    const db = createTestDb();
    const user = await insertUser(db);

    // Simulate what scan.ts does on Gemini failure
    await db.insert(analysisLogs).values({
      userId: user.id,
      modelName: "gemini-2.5-flash",
      promptVersion: "v1",
      rawAiOutput: "",
      errorMessage: "Zod validation failed",
    });

    const logs = await db.select().from(analysisLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.userId).toBe(user.id);
    expect(logs[0]!.mealId).toBeNull();
    expect(logs[0]!.errorMessage).toBe("Zod validation failed");
  });

  it("inserts successful scan log with both userId and mealId", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    const meal = await insertMeal(db, user.id, Date.now());

    // Simulate what scan.ts does on success
    await db.insert(analysisLogs).values({
      userId: user.id,
      mealId: meal.id,
      modelName: "gemini-2.5-flash",
      promptVersion: "v1",
      rawAiOutput: '{"meal_name":"chicken"}',
      parsedOutput: '{"meal_name":"chicken","items":[],"totals":{"calories":500,"protein_g":40,"carbs_g":50,"fat_g":15},"overall_confidence":0.9,"assumptions":[],"uncertainty_notes":[]}',
    });

    const logs = await db.select().from(analysisLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.userId).toBe(user.id);
    expect(logs[0]!.mealId).toBe(meal.id);
    expect(logs[0]!.errorMessage).toBeNull();
  });

  it("reset can clean up failed scan logs via userId", async () => {
    const db = createTestDb();
    const user = await insertUser(db);

    // 2 failed scans (orphaned, no mealId)
    await insertAnalysisLog(db, { userId: user.id, mealId: null, errorMessage: "fail 1" });
    await insertAnalysisLog(db, { userId: user.id, mealId: null, errorMessage: "fail 2" });
    // 1 successful scan (has mealId)
    const meal = await insertMeal(db, user.id, Date.now());
    await insertAnalysisLog(db, { userId: user.id, mealId: meal.id });

    // Reset: delete by userId catches all of them
    await db.delete(analysisLogs).where(eq(analysisLogs.userId, user.id));

    const remaining = await db.select().from(analysisLogs);
    expect(remaining).toHaveLength(0);
  });

  it("deleting meal leaves orphaned log, but userId delete cleans it", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    const meal = await insertMeal(db, user.id, Date.now());
    await insertAnalysisLog(db, { userId: user.id, mealId: meal.id });

    // Delete the meal (analysis_logs.mealId → SET NULL)
    await db.delete(meals).where(eq(meals.id, meal.id));

    const orphaned = await db.select().from(analysisLogs);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]!.mealId).toBeNull();
    expect(orphaned[0]!.userId).toBe(user.id);

    // Now clean up via userId (what reset does)
    await db.delete(analysisLogs).where(eq(analysisLogs.userId, user.id));

    expect(await db.select().from(analysisLogs)).toHaveLength(0);
  });
});

import { describe, expect, it } from "bun:test";
import { evaluateDailyHit, nextStreakCount } from "../services/streak";

describe("evaluateDailyHit", () => {
  const target = { dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 65 };

  it("hits when calories and protein are within window", () => {
    const result = evaluateDailyHit(target, {
      caloriesIn: 2000, caloriesBurned: 0, proteinG: 150,
    });
    expect(result.calorieHit).toBe(true);
    expect(result.proteinHit).toBe(true);
    expect(result.streakHit).toBe(true);
  });

  it("misses when calories are too low", () => {
    const result = evaluateDailyHit(target, {
      caloriesIn: 1500, caloriesBurned: 0, proteinG: 150,
    });
    expect(result.calorieHit).toBe(false);
    expect(result.streakHit).toBe(false);
  });

  it("misses when calories are too high", () => {
    const result = evaluateDailyHit(target, {
      caloriesIn: 2500, caloriesBurned: 0, proteinG: 150,
    });
    expect(result.calorieHit).toBe(false);
  });

  it("misses when protein is too low", () => {
    const result = evaluateDailyHit(target, {
      caloriesIn: 2000, caloriesBurned: 0, proteinG: 100,
    });
    expect(result.proteinHit).toBe(false);
    expect(result.streakHit).toBe(false);
  });

  it("misses when caloriesIn is 0 (no logs)", () => {
    const result = evaluateDailyHit(target, {
      caloriesIn: 0, caloriesBurned: 0, proteinG: 0,
    });
    expect(result.calorieHit).toBe(false);
  });

  it("respects custom window percentages", () => {
    const result = evaluateDailyHit(target, {
      caloriesIn: 1900, caloriesBurned: 0, proteinG: 140,
    }, { calorieWindowPct: 5, proteinWindowPct: 5 });
    // 5% of 2000 = 100, so 1900 is within [1900, 2100]
    expect(result.calorieHit).toBe(true);
    // 5% of 150 = 7.5, so proteinMin = 142.5, 140 < 142.5
    expect(result.proteinHit).toBe(false);
  });
});

describe("nextStreakCount", () => {
  it("increments on hit", () => {
    expect(nextStreakCount(5, true)).toBe(6);
  });

  it("resets to 0 on miss", () => {
    expect(nextStreakCount(5, false)).toBe(0);
  });

  it("starts from 0 on first hit", () => {
    expect(nextStreakCount(0, true)).toBe(1);
  });
});

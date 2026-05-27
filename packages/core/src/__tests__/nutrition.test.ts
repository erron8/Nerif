import { describe, expect, it } from "bun:test";
import {
  calculateBmr,
  calculateTdee,
  suggestFormulaTarget,
  suggestWeightGoalDeadline,
} from "../services/nutrition";

describe("calculateBmr", () => {
  it("calculates male BMR with Mifflin-St Jeor", () => {
    // 10*80 + 6.25*175 - 5*25 + 5 = 800 + 1093.75 - 125 + 5 = 1774
    const bmr = calculateBmr({ sex: "M", weightKg: 80, heightCm: 175, age: 25 });
    expect(bmr).toBe(1774);
  });

  it("calculates female BMR with Mifflin-St Jeor", () => {
    // 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370
    const bmr = calculateBmr({ sex: "F", weightKg: 65, heightCm: 165, age: 30 });
    expect(bmr).toBe(1370);
  });
});

describe("calculateTdee", () => {
  it("applies activity factor to BMR", () => {
    const result = calculateTdee({
      sex: "M", weightKg: 80, heightCm: 175, age: 25, activityLevel: "moderate",
    });
    expect(result.bmr).toBe(1774);
    expect(result.tdee).toBe(Math.round(1774 * 1.55));
  });
});

describe("suggestFormulaTarget", () => {
  it("suggests deficit for weight loss", () => {
    const target = suggestFormulaTarget({
      sex: "M", age: 25, heightCm: 175,
      currentWeightKg: 80, targetWeightKg: 75, activityLevel: "moderate",
    });
    expect(target.dailyCalories).toBeLessThan(2800);
    expect(target.proteinG).toBeGreaterThan(0);
    expect(target.carbsG).toBeGreaterThanOrEqual(0);
    expect(target.fatG).toBeGreaterThan(0);
  });

  it("suggests surplus for weight gain", () => {
    const target = suggestFormulaTarget({
      sex: "M", age: 25, heightCm: 175,
      currentWeightKg: 70, targetWeightKg: 75, activityLevel: "moderate",
    });
    expect(target.dailyCalories).toBeGreaterThan(0);
  });

  it("never suggests below 1200 kcal", () => {
    const target = suggestFormulaTarget({
      sex: "F", age: 60, heightCm: 150,
      currentWeightKg: 45, targetWeightKg: 43, activityLevel: "sedentary",
    });
    expect(target.dailyCalories).toBeGreaterThanOrEqual(1200);
  });
});

describe("suggestWeightGoalDeadline", () => {
  it("returns a date in the future for weight loss", () => {
    const deadline = suggestWeightGoalDeadline({
      currentWeightKg: 80, targetWeightKg: 75,
    });
    expect(deadline.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns same date when delta is 0", () => {
    const from = new Date("2026-05-27");
    const deadline = suggestWeightGoalDeadline({
      currentWeightKg: 80, targetWeightKg: 80, from,
    });
    expect(deadline.getTime()).toBe(from.getTime());
  });

  it("aggressive mode gives shorter deadline", () => {
    const normal = suggestWeightGoalDeadline({
      currentWeightKg: 80, targetWeightKg: 70, from: new Date("2026-05-27"),
    });
    const aggressive = suggestWeightGoalDeadline({
      currentWeightKg: 80, targetWeightKg: 70, from: new Date("2026-05-27"), aggressive: true,
    });
    expect(aggressive.getTime()).toBeLessThan(normal.getTime());
  });
});

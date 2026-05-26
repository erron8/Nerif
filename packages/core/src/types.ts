import type { activityLevels } from "./db/schema";

export type ActivityLevel = (typeof activityLevels)[number];
export type Sex = "M" | "F";

export interface UserProfileInput {
  sex: Sex;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
}

export interface MacroTarget {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DailyTotals {
  caloriesIn: number;
  caloriesBurned: number;
  proteinG: number;
}

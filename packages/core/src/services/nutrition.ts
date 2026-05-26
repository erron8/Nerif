import type { ActivityLevel, MacroTarget, Sex, UserProfileInput } from "../types";

export const activityFactors: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateBmr(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
}) {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  return Math.round(input.sex === "M" ? base + 5 : base - 161);
}

export function calculateTdee(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
}) {
  const bmr = calculateBmr(input);
  return {
    bmr,
    tdee: Math.round(bmr * activityFactors[input.activityLevel]),
  };
}

export function suggestFormulaTarget(profile: UserProfileInput): MacroTarget {
  const { tdee } = calculateTdee({
    sex: profile.sex,
    weightKg: profile.currentWeightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    activityLevel: profile.activityLevel,
  });
  const isLoss = profile.targetWeightKg < profile.currentWeightKg;
  const isGain = profile.targetWeightKg > profile.currentWeightKg;
  const dailyCalories = isLoss ? tdee - 500 : isGain ? tdee + 300 : tdee;
  const proteinG = Math.round(profile.currentWeightKg * (isLoss ? 2 : 1.8));
  const fatG = Math.round(Math.max(profile.currentWeightKg * 0.6, dailyCalories * 0.25 / 9));
  const carbsG = Math.max(
    0,
    Math.round((dailyCalories - proteinG * 4 - fatG * 9) / 4),
  );

  return {
    dailyCalories: Math.max(1200, Math.round(dailyCalories)),
    proteinG,
    carbsG,
    fatG,
  };
}

export function suggestWeightGoalDeadline(input: {
  currentWeightKg: number;
  targetWeightKg: number;
  from?: Date;
  aggressive?: boolean;
}) {
  const from = input.from ?? new Date();
  const delta = Math.abs(input.currentWeightKg - input.targetWeightKg);
  if (delta === 0) {
    return from;
  }

  const weeklyRate =
    input.targetWeightKg < input.currentWeightKg
      ? input.currentWeightKg * 0.01
      : input.currentWeightKg * 0.005;
  const adjustedRate = input.aggressive ? weeklyRate * 1.5 : weeklyRate;
  const weeks = Math.ceil(delta / adjustedRate);
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date;
}

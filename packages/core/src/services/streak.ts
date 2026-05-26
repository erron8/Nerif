import type { DailyTotals, MacroTarget } from "../types";

export interface StreakWindows {
  calorieWindowPct: number;
  proteinWindowPct: number;
}

export function evaluateDailyHit(
  target: MacroTarget,
  totals: DailyTotals,
  windows: StreakWindows = { calorieWindowPct: 10, proteinWindowPct: 10 },
) {
  const calorieDelta = target.dailyCalories * (windows.calorieWindowPct / 100);
  const calorieMin = target.dailyCalories - calorieDelta;
  const calorieMax = target.dailyCalories + calorieDelta;
  const proteinMin = target.proteinG * (1 - windows.proteinWindowPct / 100);

  const calorieHit =
    totals.caloriesIn > 0 &&
    totals.caloriesIn >= calorieMin &&
    totals.caloriesIn <= calorieMax;
  const proteinHit = totals.proteinG >= proteinMin;

  return {
    calorieHit,
    proteinHit,
    streakHit: calorieHit && proteinHit,
    calorieMin: Math.round(calorieMin),
    calorieMax: Math.round(calorieMax),
    proteinMin: Math.round(proteinMin),
  };
}

export function nextStreakCount(previousCount: number, streakHit: boolean) {
  return streakHit ? previousCount + 1 : 0;
}

export type GoalStatus = "active" | "hit" | "missed" | "abandoned";
export type GoalType = "weight" | "body_fat";

export function resolveGoal(input: {
  type: GoalType;
  startingValue: number;
  targetValue: number;
  latestValue: number | null;
  deadline: string;
  today: string;
}): "active" | "hit" | "missed" {
  if (input.latestValue == null) {
    return input.today > input.deadline ? "missed" : "active";
  }

  const isLowerBetter = input.targetValue < input.startingValue;

  const hit = isLowerBetter
    ? input.latestValue <= input.targetValue
    : input.latestValue >= input.targetValue;

  if (hit) {
    return "hit";
  }

  return input.today > input.deadline ? "missed" : "active";
}

export function daysUntilDeadline(deadline: string, today = new Date()) {
  const deadlineDate = new Date(`${deadline}T00:00:00.000Z`);
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.ceil((deadlineDate.getTime() - todayUtc) / 86_400_000);
}

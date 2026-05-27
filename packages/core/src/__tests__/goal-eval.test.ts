import { describe, expect, it } from "bun:test";
import { resolveGoal, daysUntilDeadline } from "../services/goal-eval";

describe("resolveGoal", () => {
  describe("weight goals", () => {
    it("hits when current weight meets lower target (loss goal)", () => {
      const result = resolveGoal({
        type: "weight",
        startingValue: 80,
        targetValue: 75,
        latestValue: 75,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("hit");
    });

    it("hits when current weight meets higher target (gain goal)", () => {
      const result = resolveGoal({
        type: "weight",
        startingValue: 70,
        targetValue: 75,
        latestValue: 75,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("hit");
    });

    it("stays active when weight not yet at loss target", () => {
      const result = resolveGoal({
        type: "weight",
        startingValue: 80,
        targetValue: 75,
        latestValue: 77,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("active");
    });

    it("stays active when weight not yet at gain target", () => {
      const result = resolveGoal({
        type: "weight",
        startingValue: 70,
        targetValue: 75,
        latestValue: 72,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("active");
    });

    it("misses when deadline passed and target not met", () => {
      const result = resolveGoal({
        type: "weight",
        startingValue: 80,
        targetValue: 75,
        latestValue: 78,
        deadline: "2026-05-20",
        today: "2026-05-27",
      });
      expect(result).toBe("missed");
    });

    it("returns active when no data yet and deadline not passed", () => {
      const result = resolveGoal({
        type: "weight",
        startingValue: 80,
        targetValue: 75,
        latestValue: null,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("active");
    });
  });

  describe("body fat goals", () => {
    it("hits when body fat meets lower target", () => {
      const result = resolveGoal({
        type: "body_fat",
        startingValue: 20,
        targetValue: 15,
        latestValue: 15,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("hit");
    });

    it("stays active when body fat not yet at target", () => {
      const result = resolveGoal({
        type: "body_fat",
        startingValue: 20,
        targetValue: 15,
        latestValue: 18,
        deadline: "2026-06-01",
        today: "2026-05-27",
      });
      expect(result).toBe("active");
    });
  });
});

describe("daysUntilDeadline", () => {
  it("returns positive days when deadline is in the future", () => {
    const days = daysUntilDeadline("2026-06-15", new Date("2026-05-27"));
    expect(days).toBe(19);
  });

  it("returns negative days when deadline has passed", () => {
    const days = daysUntilDeadline("2026-05-20", new Date("2026-05-27"));
    expect(days).toBe(-7);
  });

  it("returns 0 on the deadline day", () => {
    const days = daysUntilDeadline("2026-05-27", new Date("2026-05-27"));
    expect(days).toBe(0);
  });
});

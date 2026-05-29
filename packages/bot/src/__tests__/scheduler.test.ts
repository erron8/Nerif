import { describe, expect, it, mock, beforeEach } from "bun:test";

// Mock croner before importing scheduler
const mockCronInstances: Array<{ stopped: boolean; callback: Function }> = [];

mock.module("croner", () => {
  return {
    Cron: class MockCron {
      stopped = false;
      callback: Function;

      constructor(
        _pattern: string,
        _opts: unknown,
        cb: Function,
      ) {
        this.callback = cb;
        mockCronInstances.push(this);
      }

      stop() {
        this.stopped = true;
      }
    },
  };
});

import { isInDndWindow, clearUserSchedules, registerUserSchedules } from "../scheduler";

beforeEach(() => {
  mockCronInstances.length = 0;
});

describe("isInDndWindow", () => {
  it("returns false when current time is outside DND window", () => {
    // 10:00 UTC is outside 22:30-06:30
    const now = new Date("2026-05-29T10:00:00Z");
    expect(isInDndWindow(now, "22:30", "06:30", "UTC")).toBe(false);
  });

  it("returns true when current time is inside overnight DND window (before end)", () => {
    // 03:00 UTC is inside 22:30-06:30
    const now = new Date("2026-05-29T03:00:00Z");
    expect(isInDndWindow(now, "22:30", "06:30", "UTC")).toBe(true);
  });

  it("returns true when current time is inside overnight DND window (after start)", () => {
    // 23:00 UTC is inside 22:30-06:30
    const now = new Date("2026-05-29T23:00:00Z");
    expect(isInDndWindow(now, "22:30", "06:30", "UTC")).toBe(true);
  });

  it("returns false at exact DND end time (exclusive)", () => {
    // 06:30 UTC is the end boundary (exclusive)
    const now = new Date("2026-05-29T06:30:00Z");
    expect(isInDndWindow(now, "22:30", "06:30", "UTC")).toBe(false);
  });

  it("returns true at exact DND start time (inclusive)", () => {
    // 22:30 UTC is the start boundary (inclusive)
    const now = new Date("2026-05-29T22:30:00Z");
    expect(isInDndWindow(now, "22:30", "06:30", "UTC")).toBe(true);
  });

  it("handles same-day DND window (start < end)", () => {
    // DND 09:00-17:00, check at 12:00
    const now = new Date("2026-05-29T12:00:00Z");
    expect(isInDndWindow(now, "09:00", "17:00", "UTC")).toBe(true);
  });

  it("returns false outside same-day DND window", () => {
    // DND 09:00-17:00, check at 20:00
    const now = new Date("2026-05-29T20:00:00Z");
    expect(isInDndWindow(now, "09:00", "17:00", "UTC")).toBe(false);
  });

  it("respects timezone parameter", () => {
    // 2026-05-29T02:00:00Z = 10:00 in UTC+8 (Asia/Makassar)
    // DND 22:30-06:30 in Makassar → 14:30-22:30 UTC
    // 02:00 UTC is outside the DND window in Makassar
    const now = new Date("2026-05-29T02:00:00Z");
    expect(isInDndWindow(now, "22:30", "06:30", "Asia/Makassar")).toBe(false);

    // 2026-05-29T16:00:00Z = 00:00 in UTC+8 → inside DND
    const now2 = new Date("2026-05-29T16:00:00Z");
    expect(isInDndWindow(now2, "22:30", "06:30", "Asia/Makassar")).toBe(true);
  });
});

describe("clearUserSchedules", () => {
  it("is a no-op when no jobs exist for user", () => {
    // Should not throw
    clearUserSchedules(999);
  });
});

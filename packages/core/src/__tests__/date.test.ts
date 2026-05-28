import { describe, expect, it } from "bun:test";
import { localDateString, toUtcBounds } from "../date";

describe("localDateString", () => {
  it("returns YYYY-MM-DD in the given timezone", () => {
    // 2026-05-28T00:30:00 UTC = May 28 in UTC, but May 27 in America/New_York (UTC-4/5)
    const date = new Date("2026-05-28T00:30:00Z");
    expect(localDateString(date, "America/New_York")).toBe("2026-05-27");
    expect(localDateString(date, "Asia/Tokyo")).toBe("2026-05-28");
  });

  it("handles midnight boundary correctly", () => {
    // 2026-05-28T16:00:00 UTC = midnight in Asia/Makassar (UTC+8)
    const date = new Date("2026-05-28T16:00:00Z");
    expect(localDateString(date, "Asia/Makassar")).toBe("2026-05-29");
    expect(localDateString(date, "UTC")).toBe("2026-05-28");
  });

  it("returns consistent format regardless of timezone offset", () => {
    const date = new Date("2026-01-01T12:00:00Z");
    const result = localDateString(date, "Europe/Berlin");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toUtcBounds", () => {
  it("returns 24h span for UTC", () => {
    const { start, end } = toUtcBounds("2026-05-28", "UTC");
    expect(end - start).toBe(86_400_000);
    expect(new Date(start).toISOString()).toBe("2026-05-28T00:00:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-05-29T00:00:00.000Z");
  });

  it("shifts bounds east of UTC (Asia/Makassar, UTC+8)", () => {
    const { start, end } = toUtcBounds("2026-05-28", "Asia/Makassar");
    expect(new Date(start).toISOString()).toBe("2026-05-27T16:00:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-05-28T16:00:00.000Z");
    expect(end - start).toBe(86_400_000);
  });

  it("shifts bounds west of UTC (America/New_York, UTC-4 in May)", () => {
    const { start, end } = toUtcBounds("2026-05-28", "America/New_York");
    expect(new Date(start).toISOString()).toBe("2026-05-28T04:00:00.000Z");
    expect(new Date(end).toISOString()).toBe("2026-05-29T04:00:00.000Z");
    expect(end - start).toBe(86_400_000);
  });

  it("handles DST spring-forward (America/New_York, Mar 8 2026 — clocks skip 2am)", () => {
    // 2026 DST start in US: March 8. That day is only 23h long.
    const { start, end } = toUtcBounds("2026-03-08", "America/New_York");
    expect(end - start).toBe(23 * 3600_000);
    // Local midnight Mar 8 = 05:00 UTC (EST = UTC-5)
    expect(new Date(start).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    // Local midnight Mar 9 = 04:00 UTC (EDT = UTC-4)
    expect(new Date(end).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("handles DST fall-back (America/New_York, Nov 1 2026 — clocks repeat 1am)", () => {
    // 2026 DST end in US: November 1. That day is 25h long.
    const { start, end } = toUtcBounds("2026-11-01", "America/New_York");
    expect(end - start).toBe(25 * 3600_000);
    // Local midnight Nov 1 = 04:00 UTC (EDT = UTC-4)
    expect(new Date(start).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    // Local midnight Nov 2 = 05:00 UTC (EST = UTC-5)
    expect(new Date(end).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("a UTC timestamp at the exact start is included", () => {
    const { start } = toUtcBounds("2026-05-28", "Asia/Makassar");
    expect(localDateString(new Date(start), "Asia/Makassar")).toBe("2026-05-28");
  });

  it("a UTC timestamp at the exact end is excluded (belongs to next day)", () => {
    const { end } = toUtcBounds("2026-05-28", "Asia/Makassar");
    expect(localDateString(new Date(end), "Asia/Makassar")).toBe("2026-05-29");
  });
});

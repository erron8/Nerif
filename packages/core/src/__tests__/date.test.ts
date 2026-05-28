import { describe, expect, it } from "bun:test";
import { localDateString } from "../date";

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

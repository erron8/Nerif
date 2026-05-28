import { describe, expect, it } from "bun:test";
import { buildImagePath, readFoodScanPrompt } from "../services/gemini";

describe("buildImagePath", () => {
  it("constructs path with userId, date, fileId, and extension", () => {
    const path = buildImagePath("/data/images", 42, "2026-05-28", "abc123", "jpg");
    expect(path).toMatch(/^\/data\/images\/42\/2026-05-28\/\d+-abc123\.jpg$/);
  });

  it("defaults extension to jpg", () => {
    const path = buildImagePath("/data/images", 1, "2026-01-01", "xyz");
    expect(path).toMatch(/\.jpg$/);
  });

  it("supports png extension", () => {
    const path = buildImagePath("/img", 99, "2026-12-31", "file", "png");
    expect(path).toMatch(/\.png$/);
  });

  it("includes timestamp in filename for uniqueness", () => {
    const before = Date.now();
    const path = buildImagePath("/img", 1, "2026-01-01", "f");
    const after = Date.now();
    const ts = Number(path.match(/\/(\d+)-f\.jpg$/)?.[1]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("readFoodScanPrompt", () => {
  it("returns non-empty string containing food analysis instructions", async () => {
    const prompt = await readFoodScanPrompt();
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("food");
    expect(prompt).toContain("JSON");
  });
});

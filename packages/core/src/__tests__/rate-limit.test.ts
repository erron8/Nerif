import { describe, expect, it } from "bun:test";

import { checkScanLimit, incrementScanCount } from "../services/rate-limit";
import { createTestDb, insertUser } from "./helpers";

describe("checkScanLimit", () => {
  it("returns ok with count 0 when no scans exist", async () => {
    const db = createTestDb();
    const user = await insertUser(db);

    const result = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 10,
      hardLimit: 20,
    });

    expect(result.status).toBe("ok");
    expect(result.count).toBe(0);
  });

  it("returns ok when count is below soft limit", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });
    await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });

    const result = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 5,
      hardLimit: 10,
    });

    expect(result.status).toBe("ok");
    expect(result.count).toBe(2);
  });

  it("returns soft when count reaches soft limit", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    for (let i = 0; i < 5; i++) {
      await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });
    }

    const result = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 5,
      hardLimit: 10,
    });

    expect(result.status).toBe("soft");
    expect(result.count).toBe(5);
  });

  it("returns hard when count reaches hard limit", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    for (let i = 0; i < 10; i++) {
      await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });
    }

    const result = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 5,
      hardLimit: 10,
    });

    expect(result.status).toBe("hard");
    expect(result.count).toBe(10);
  });

  it("skips soft check when softLimit is 0 (disabled)", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    for (let i = 0; i < 5; i++) {
      await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });
    }

    const result = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 0,
      hardLimit: 10,
    });

    expect(result.status).toBe("ok");
  });

  it("skips hard check when hardLimit is 0 (disabled)", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    for (let i = 0; i < 100; i++) {
      await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });
    }

    const result = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 0,
      hardLimit: 0,
    });

    expect(result.status).toBe("ok");
    expect(result.count).toBe(100);
  });

  it("tracks counts independently per date", async () => {
    const db = createTestDb();
    const user = await insertUser(db);
    for (let i = 0; i < 5; i++) {
      await incrementScanCount(db, { userId: user.id, date: "2026-05-28" });
    }
    await incrementScanCount(db, { userId: user.id, date: "2026-05-29" });

    const yesterday = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-28",
      softLimit: 5,
      hardLimit: 10,
    });
    expect(yesterday.status).toBe("soft");
    expect(yesterday.count).toBe(5);

    const today = await checkScanLimit(db, {
      userId: user.id,
      date: "2026-05-29",
      softLimit: 5,
      hardLimit: 10,
    });
    expect(today.status).toBe("ok");
    expect(today.count).toBe(1);
  });
});

import { and, eq, sql } from "drizzle-orm";

import type { NerifDb } from "../db/client";
import { scanCounts } from "../db/schema";

export type ScanLimitStatus = "ok" | "soft" | "hard";

export async function checkScanLimit(
  db: NerifDb,
  input: {
    userId: number;
    date: string;
    softLimit: number;
    hardLimit: number;
  },
): Promise<{ status: ScanLimitStatus; count: number }> {
  const [row] = await db
    .select()
    .from(scanCounts)
    .where(
      and(eq(scanCounts.userId, input.userId), eq(scanCounts.date, input.date)),
    )
    .limit(1);

  const count = row?.count ?? 0;

  if (count >= input.hardLimit) {
    return { status: "hard", count };
  }

  if (count >= input.softLimit) {
    return { status: "soft", count };
  }

  return { status: "ok", count };
}

export async function incrementScanCount(
  db: NerifDb,
  input: { userId: number; date: string },
) {
  await db
    .insert(scanCounts)
    .values({ userId: input.userId, date: input.date, count: 1 })
    .onConflictDoUpdate({
      target: [scanCounts.userId, scanCounts.date],
      set: { count: sql`${scanCounts.count} + 1` },
    });
}

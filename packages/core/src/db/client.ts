import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import * as schema from "./schema";

export type NerifDb = BunSQLiteDatabase<typeof schema>;

export function createDatabase(path = process.env.DB_PATH ?? "./data/nerif.db") {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  return drizzle(sqlite, { schema });
}

export const db = createDatabase();

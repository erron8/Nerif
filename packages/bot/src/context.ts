import type { ConversationFlavor } from "@grammyjs/conversations";
import type { Context, SessionFlavor } from "grammy";

import type { users, NerifDb } from "@nerif/core";

export interface SessionData {
  mutedUntil?: string;
  name?: string;
}

export type UserRecord = typeof users.$inferSelect;

export type NerifContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor & {
    userRecord: UserRecord | undefined;
    db: NerifDb;
  };

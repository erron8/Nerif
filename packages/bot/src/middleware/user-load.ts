import { eq } from "drizzle-orm";
import type { MiddlewareFn } from "grammy";
import type { Logger } from "pino";

import type { NerifDb } from "@nerif/core";
import { users } from "@nerif/core";

import type { NerifContext } from "../context";

const PUBLIC_COMMANDS = new Set(["start", "cancel"]);

export function userLoadMiddleware(
  db: NerifDb,
  logger: Logger,
): MiddlewareFn<NerifContext> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) {
      await next();
      return;
    }

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);
      ctx.userRecord = user;
    } catch (err) {
      logger.error({ err, telegramId }, "failed to load telegram user");
    }

    // Guard: block user-specific commands if no profile exists
    const command = ctx.message?.text?.match(/^\/(\w+)/)?.[1];
    if (command && !PUBLIC_COMMANDS.has(command) && !ctx.userRecord) {
      await ctx.reply("Set up your profile first: /start");
      return;
    }

    await next();
  };
}

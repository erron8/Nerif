import { and, eq } from "drizzle-orm";
import type { Bot } from "grammy";

import { users, weightLogs, localDateString } from "@nerif/core";

import type { NerifContext } from "../context";

export function registerWeightHandlers(bot: Bot<NerifContext>) {
  bot.command("weight", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const raw = ctx.match?.trim();
    const weight = Number(raw);
    if (!raw || !Number.isFinite(weight) || weight < 20 || weight > 300) {
      await ctx.reply("⚖️ Try this format:\n/weight <kg>\n\nExample:\n/weight 77.4");
      return;
    }

    const today = localDateString(new Date(), user.timezone);

    // Upsert: update if exists for today, insert otherwise
    const [existing] = await ctx.db
      .select()
      .from(weightLogs)
      .where(and(eq(weightLogs.userId, user.id), eq(weightLogs.date, today)))
      .limit(1);

    if (existing) {
      await ctx.db
        .update(weightLogs)
        .set({ weightKg: weight })
        .where(eq(weightLogs.id, existing.id));
    } else {
      await ctx.db.insert(weightLogs).values({
        userId: user.id,
        date: today,
        weightKg: weight,
      });
    }

    // Update user's current weight
    await ctx.db
      .update(users)
      .set({ currentWeightKg: weight })
      .where(eq(users.id, user.id));
    ctx.userRecord = { ...user, currentWeightKg: weight };

    const delta = weight - user.startingWeightKg;
    const sign = delta >= 0 ? "+" : "";
    await ctx.reply(
      `✅ Weight logged: ${weight} kg\nFrom start: ${sign}${delta.toFixed(1)} kg`,
    );
  });
}

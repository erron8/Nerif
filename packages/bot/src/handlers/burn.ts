import type { Bot } from "grammy";

import { burnEntries } from "@nerif/core";

import type { NerifContext } from "../context";

function parseBurnArgs(raw: string) {
  const parts = raw.split("|").map((s) => s.trim());
  if (parts.length < 2) return null;
  const [activity, calStr, minStr] = parts;
  const caloriesBurned = Number(calStr);
  if (!activity || !Number.isFinite(caloriesBurned) || caloriesBurned < 0 || caloriesBurned > 5000) return null;
  if (parts.length >= 3) {
    const durationMin = Number(minStr);
    if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440) return null;
    return { activity, caloriesBurned, durationMin };
  }
  return { activity, caloriesBurned, durationMin: null };
}

export function registerBurnHandlers(bot: Bot<NerifContext>) {
  bot.command("burn", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const parsed = parseBurnArgs(ctx.match ?? "");
    if (!parsed) {
      await ctx.reply(
        "🔥 Try this format:\n/burn activity | kcal | minutes\n\nExample:\n/burn Running | 350 | 45",
      );
      return;
    }

    await ctx.db.insert(burnEntries).values({
      userId: user.id,
      timestamp: Date.now(),
      activity: parsed.activity,
      caloriesBurned: parsed.caloriesBurned,
      durationMin: parsed.durationMin,
    });

    const dur = parsed.durationMin ? ` · ${parsed.durationMin} min` : "";
    await ctx.reply(
      `✅ Burned: ${parsed.activity} — ${parsed.caloriesBurned} kcal${dur}`,
    );
  });
}

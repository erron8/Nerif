import type { Bot } from "grammy";

import { burnEntries, localDateString } from "@nerif/core";

import type { NerifContext } from "../context";

function parseBurnArgs(text: string) {
  const parts = text
    .replace(/^\/burn\s*/, "")
    .split("|")
    .map((s) => s.trim());
  if (parts.length < 2) return null;
  const [activity, calStr, minStr] = parts;
  const caloriesBurned = Number(calStr);
  if (!activity || !Number.isFinite(caloriesBurned)) return null;
  const durationMin = minStr ? Number(minStr) : null;
  return {
    activity,
    caloriesBurned,
    durationMin: durationMin && Number.isFinite(durationMin) ? durationMin : null,
  };
}

export function registerBurnHandlers(bot: Bot<NerifContext>) {
  bot.command("burn", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const parsed = parseBurnArgs(ctx.message?.text ?? "");
    if (!parsed) {
      await ctx.reply(
        "Format: /burn activity | kcal | minutes\nExample: /burn Running | 350 | 45",
      );
      return;
    }

    const today = localDateString(new Date(), user.timezone);

    await ctx.db.insert(burnEntries).values({
      userId: user.id,
      timestamp: Date.now(),
      activity: parsed.activity,
      caloriesBurned: parsed.caloriesBurned,
      durationMin: parsed.durationMin,
    });

    const dur = parsed.durationMin ? ` · ${parsed.durationMin} min` : "";
    await ctx.reply(
      `Burned: ${parsed.activity} — ${parsed.caloriesBurned} kcal${dur}\nDate: ${today}`,
    );
  });
}

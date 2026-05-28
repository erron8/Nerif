import { and, eq, gte } from "drizzle-orm";
import type { Bot } from "grammy";

import {
  dailyResults,
  aggregateUserToday,
  localDateString,
} from "@nerif/core";

import type { NerifContext } from "../context";

async function handleToday(ctx: NerifContext) {
  const user = ctx.userRecord;
  if (!user) return;

  // Run aggregation (upserts daily_results)
  const result = await aggregateUserToday(ctx.db, user);

  const today = localDateString(new Date(), user.timezone);

  if (!result) {
    await ctx.reply(
      [
        `Today (${today})`,
        "",
        "No targets set yet. Use /settings to configure.",
        "",
        "Use /log, /burn, /weight to add data.",
      ].join("\n"),
    );
    return;
  }

  const icon = result.streakHit ? "✓" : "✗";
  const hitLine = result.streakHit
    ? "On track!"
    : `Off track — ${result.calorieHit ? "calories ok" : "calories off"}, ${result.proteinHit ? "protein ok" : "protein low"}`;

  await ctx.reply(
    [
      `Today (${today}) ${icon}`,
      "",
      `${result.caloriesIn} kcal in · ${result.caloriesBurned} burned · net ${result.caloriesIn - result.caloriesBurned}`,
      `${result.proteinG}g protein`,
      "",
      hitLine,
      `Streak: ${result.streakCountAfter} day${result.streakCountAfter === 1 ? "" : "s"}`,
      "",
      "Use /log, /burn, /weight to add data.",
    ].join("\n"),
  );
}

async function handleWeek(ctx: NerifContext) {
  const user = ctx.userRecord;
  if (!user) return;

  // Compute 6 days ago in UTC to avoid server-timezone skew
  const weekAgo = new Date(Date.now() - 6 * 86_400_000);
  const startDate = localDateString(weekAgo, user.timezone);

  const rows = await ctx.db
    .select()
    .from(dailyResults)
    .where(
      and(
        eq(dailyResults.userId, user.id),
        gte(dailyResults.date, startDate),
      ),
    )
    .orderBy(dailyResults.date);

  if (rows.length === 0) {
    await ctx.reply(
      "No daily data yet. Log meals and check /today to build your week.",
    );
    return;
  }

  const lines = rows.map((r) => {
    const icon = r.streakHit ? "✓" : "✗";
    return `${icon} ${r.date} — ${Math.round(r.caloriesIn)} kcal, streak ${r.streakCountAfter}`;
  });

  const hitDays = rows.filter((r) => r.streakHit).length;
  await ctx.reply(
    [
      `Week view (${rows.length} days):`,
      "",
      ...lines,
      "",
      `${hitDays}/${rows.length} days on track`,
    ].join("\n"),
  );
}

export function registerProgressHandlers(bot: Bot<NerifContext>) {
  bot.command("today", handleToday);
  bot.command("week", handleWeek);

  bot.callbackQuery("menu:today", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleToday(ctx);
  });

  bot.callbackQuery("menu:week", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleWeek(ctx);
  });
}

import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Bot } from "grammy";

import {
  burnEntries,
  dailyResults,
  meals,
  targets,
  localDateString,
  evaluateDailyHit,
  nextStreakCount,
} from "@nerif/core";

import type { NerifContext } from "../context";

function startOfDay(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

export function registerProgressHandlers(bot: Bot<NerifContext>) {
  bot.command("today", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const today = localDateString(new Date(), user.timezone);
    const dayStart = startOfDay(today);

    // Sum meals
    const mealRows = await ctx.db
      .select({
        cal: sql<number>`sum(${meals.totalCalories})`,
        prot: sql<number>`sum(${meals.totalProteinG})`,
        count: sql<number>`count(*)`,
      })
      .from(meals)
      .where(and(eq(meals.userId, user.id), gte(meals.timestamp, dayStart)));

    const caloriesIn = Math.round(mealRows[0]?.cal ?? 0);
    const proteinG = Math.round(mealRows[0]?.prot ?? 0);
    const mealCount = mealRows[0]?.count ?? 0;

    // Sum burn
    const burnRows = await ctx.db
      .select({ burned: sql<number>`sum(${burnEntries.caloriesBurned})` })
      .from(burnEntries)
      .where(
        and(eq(burnEntries.userId, user.id), gte(burnEntries.timestamp, dayStart)),
      );
    const caloriesBurned = Math.round(burnRows[0]?.burned ?? 0);

    // Get active target
    const [target] = await ctx.db
      .select()
      .from(targets)
      .where(eq(targets.userId, user.id))
      .orderBy(desc(targets.generatedAt))
      .limit(1);

    let hitLine = "No targets set — use /settings.";
    let streakLine = "";

    if (target) {
      const hit = evaluateDailyHit(
        {
          dailyCalories: target.dailyCalories,
          proteinG: target.proteinG,
          carbsG: target.carbsG,
          fatG: target.fatG,
        },
        { caloriesIn, caloriesBurned, proteinG },
        {
          calorieWindowPct: target.calorieWindowPct,
          proteinWindowPct: target.proteinWindowPct,
        },
      );

      hitLine = hit.streakHit
        ? "On track!"
        : `Off track — need ${hit.calorieMin}-${hit.calorieMax} kcal, ${hit.proteinMin}g+ protein`;

      // Get yesterday's streak count
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yDate = localDateString(yesterday, user.timezone);
      const [prev] = await ctx.db
        .select()
        .from(dailyResults)
        .where(
          and(
            eq(dailyResults.userId, user.id),
            eq(dailyResults.date, yDate),
          ),
        )
        .limit(1);
      const prevStreak = prev?.streakCountAfter ?? 0;
      const currentStreak = nextStreakCount(prevStreak, hit.streakHit);
      streakLine = `Streak: ${currentStreak} day${currentStreak === 1 ? "" : "s"}`;
    }

    const lines = [
      `Today (${today})`,
      "",
      `Meals: ${mealCount} logged · ${caloriesIn} kcal · ${proteinG}g protein`,
      `Burned: ${caloriesBurned} kcal`,
      `Net: ${caloriesIn - caloriesBurned} kcal`,
      "",
      hitLine,
    ];
    if (streakLine) lines.push(streakLine);
    lines.push("", "Use /log, /burn, /weight to add data.");

    await ctx.reply(lines.join("\n"));
  });

  bot.command("week", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const today = localDateString(new Date(), user.timezone);

    // Get last 7 days of daily results
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
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
      [`Week view (${rows.length} days):`, "", ...lines, "", `${hitDays}/${rows.length} days on track`].join(
        "\n",
      ),
    );
  });

  bot.callbackQuery("menu:today", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /today.");
  });

  bot.callbackQuery("menu:week", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /week.");
  });
}

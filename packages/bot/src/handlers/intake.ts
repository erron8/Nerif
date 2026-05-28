import { and, desc, eq, gte } from "drizzle-orm";
import type { Bot } from "grammy";

import { meals, mealItems, localDateString } from "@nerif/core";

import type { NerifContext } from "../context";

function parseLogArgs(text: string) {
  const parts = text
    .replace(/^\/log\s*/, "")
    .split("|")
    .map((s) => s.trim());
  if (parts.length < 5) return null;
  const [mealName, calStr, protStr, carbStr, fatStr] = parts;
  const totalCalories = Number(calStr);
  const totalProteinG = Number(protStr);
  const totalCarbsG = Number(carbStr);
  const totalFatG = Number(fatStr);
  if (
    !mealName ||
    !Number.isFinite(totalCalories) ||
    !Number.isFinite(totalProteinG) ||
    !Number.isFinite(totalCarbsG) ||
    !Number.isFinite(totalFatG)
  )
    return null;
  return { mealName, totalCalories, totalProteinG, totalCarbsG, totalFatG };
}

export function registerIntakeHandlers(bot: Bot<NerifContext>) {
  bot.command("log", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const parsed = parseLogArgs(ctx.message?.text ?? "");
    if (!parsed) {
      await ctx.reply(
        "Format: /log meal name | kcal | protein | carbs | fat\nExample: /log Chicken rice | 650 | 40 | 70 | 20",
      );
      return;
    }

    const today = localDateString(new Date(), user.timezone);

    const [meal] = await ctx.db
      .insert(meals)
      .values({
        userId: user.id,
        timestamp: Date.now(),
        source: "manual",
        mealName: parsed.mealName,
        totalCalories: parsed.totalCalories,
        totalProteinG: parsed.totalProteinG,
        totalCarbsG: parsed.totalCarbsG,
        totalFatG: parsed.totalFatG,
      })
      .returning();

    await ctx.db.insert(mealItems).values({
      mealId: meal!.id,
      foodName: parsed.mealName,
      estimatedQuantity: 1,
      servingUnit: "serving",
      calories: parsed.totalCalories,
      proteinG: parsed.totalProteinG,
      carbsG: parsed.totalCarbsG,
      fatG: parsed.totalFatG,
    });

    await ctx.reply(
      [
        `Logged: ${parsed.mealName}`,
        `${parsed.totalCalories} kcal · P${parsed.totalProteinG}g C${parsed.totalCarbsG}g F${parsed.totalFatG}g`,
        `Date: ${today}`,
      ].join("\n"),
    );
  });

  bot.command("history", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const today = localDateString(new Date(), user.timezone);
    const dayStart = new Date(`${today}T00:00:00`).getTime();

    const rows = await ctx.db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, user.id), gte(meals.timestamp, dayStart)))
      .orderBy(desc(meals.timestamp));

    if (rows.length === 0) {
      await ctx.reply("No meals logged today. Use /log to add one.");
      return;
    }

    const lines = rows.map((m, i) => {
      const time = new Date(m.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: user.timezone,
      });
      return `${i + 1}. ${time} — ${m.mealName} (${m.totalCalories} kcal)`;
    });

    const totalCal = rows.reduce((s, m) => s + m.totalCalories, 0);
    await ctx.reply(
      [`Today's meals (${today}):`, "", ...lines, "", `Total: ${totalCal} kcal`].join(
        "\n",
      ),
    );
  });

  bot.command("delete_last", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const today = localDateString(new Date(), user.timezone);
    const dayStart = new Date(`${today}T00:00:00`).getTime();

    const [last] = await ctx.db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, user.id), gte(meals.timestamp, dayStart)))
      .orderBy(desc(meals.timestamp))
      .limit(1);

    if (!last) {
      await ctx.reply("No meals logged today to delete.");
      return;
    }

    await ctx.db.delete(meals).where(eq(meals.id, last.id));
    await ctx.reply(
      `Deleted: ${last.mealName} (${last.totalCalories} kcal).`,
    );
  });
}

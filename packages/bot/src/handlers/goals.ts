import { desc, eq } from "drizzle-orm";
import type { Bot } from "grammy";

import { goals, daysUntilDeadline } from "@nerif/core";

import type { NerifContext } from "../context";

async function handleGoals(ctx: NerifContext) {
  const user = ctx.userRecord;
  if (!user) return;

  const rows = await ctx.db
    .select()
    .from(goals)
    .where(eq(goals.userId, user.id))
    .orderBy(desc(goals.createdAt));

  if (rows.length === 0) {
    await ctx.reply(
      "🎯 No goals set yet. Use /settings to configure targets.",
    );
    return;
  }

  const lines = rows.map((g) => {
    const days = daysUntilDeadline(g.deadline);
    const statusIcon =
      g.status === "active" ? "⏳" : g.status === "hit" ? "✅" : "❌";
    return `${statusIcon} ${g.type} ${g.targetValue} — ${g.status} (${days}d left)`;
  });

  await ctx.reply(["🎯 Goals", "", ...lines].join("\n"));
}

export function registerGoalHandlers(bot: Bot<NerifContext>) {
  bot.command("goals", handleGoals);

  bot.callbackQuery("menu:goals", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleGoals(ctx);
  });
}

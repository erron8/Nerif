import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerGoalHandlers(bot: Bot<NerifContext>) {
  bot.command("goals", async (ctx) => {
    await ctx.reply("Goal tables and evaluator helpers are scaffolded. Goal flows come after scheduler setup.");
  });

  bot.callbackQuery("menu:goals", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /goals.");
  });
}

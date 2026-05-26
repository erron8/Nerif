import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerIntakeHandlers(bot: Bot<NerifContext>) {
  bot.command("log", async (ctx) => {
    await ctx.reply(
      "Manual food logging is the next build slice. Planned format: /log meal name | kcal | protein | carbs | fat.",
    );
  });

  bot.command("history", async (ctx) => {
    await ctx.reply("History is empty until meal logging is implemented.");
  });

  bot.command("delete_last", async (ctx) => {
    await ctx.reply("Nothing to delete yet.");
  });
}

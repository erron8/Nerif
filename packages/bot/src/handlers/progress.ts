import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerProgressHandlers(bot: Bot<NerifContext>) {
  bot.command("today", async (ctx) => {
    await ctx.reply(
      [
        "Today",
        "",
        "No meals logged yet.",
        "Targets and streak math are implemented in core; read paths come after manual logging.",
      ].join("\n"),
    );
  });

  bot.command("week", async (ctx) => {
    await ctx.reply("Week view is scaffolded; it will populate after daily aggregation is wired.");
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

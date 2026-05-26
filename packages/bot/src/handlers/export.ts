import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerExportHandlers(bot: Bot<NerifContext>) {
  bot.command("export", async (ctx) => {
    await ctx.reply("Export format is defined; ZIP generation comes after write paths are implemented.");
  });

  bot.callbackQuery("menu:history", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /history.");
  });
}

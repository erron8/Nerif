import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerScanHandlers(bot: Bot<NerifContext>) {
  bot.command("scan", async (ctx) => {
    await ctx.reply("Send a food photo and Nerif will analyze it once scan storage is wired.");
  });

  bot.on("message:photo", async (ctx) => {
    await ctx.reply(
      "Photo received. Gemini scan parsing is scaffolded in core; Telegram file download and confirmation cards are the next scan slice.",
    );
  });
}

import type { Bot } from "grammy";

import type { NerifContext } from "../context";

async function handleScan(ctx: NerifContext) {
  await ctx.reply("Send a food photo and Nerif will analyze it.");
}

export function registerScanHandlers(bot: Bot<NerifContext>) {
  bot.command("scan", handleScan);

  bot.callbackQuery("menu:scan", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleScan(ctx);
  });

  bot.on("message:photo", async (ctx) => {
    await ctx.reply(
      "Photo received. Gemini scan parsing is scaffolded in core; Telegram file download and confirmation cards are the next scan slice.",
    );
  });
}

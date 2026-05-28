import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerExportHandlers(bot: Bot<NerifContext>) {
  bot.command("export", async (ctx) => {
    await ctx.reply("⚙️ Data export is coming soon.");
  });
}

import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerNoteHandlers(bot: Bot<NerifContext>) {
  bot.command("note", async (ctx) => {
    await ctx.reply("Note storage is scaffolded. Planned format: /note sleep poor, workout strong #recovery.");
  });

  bot.callbackQuery("menu:note", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /note.");
  });
}

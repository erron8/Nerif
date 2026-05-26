import { InlineKeyboard, type Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerMenuHandlers(bot: Bot<NerifContext>) {
  bot.command("menu", showMenu);
  bot.callbackQuery("menu", showMenu);

  bot.callbackQuery("menu:log", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Manual food logging lands in the next build slice. Use /log.");
  });

  bot.callbackQuery("menu:scan", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Send a food photo after /scan.");
  });

  bot.callbackQuery("menu:burn", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /burn to log activity calories.");
  });

  bot.callbackQuery("menu:weight", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /weight to log today's weight.");
  });
}

async function showMenu(ctx: NerifContext) {
  const keyboard = new InlineKeyboard()
    .text("Log food", "menu:log")
    .text("Scan food", "menu:scan")
    .row()
    .text("Log burn", "menu:burn")
    .text("Log weight", "menu:weight")
    .row()
    .text("Today", "menu:today")
    .text("Week", "menu:week")
    .row()
    .text("Goals", "menu:goals")
    .text("Note", "menu:note")
    .row()
    .text("History", "menu:history")
    .text("Settings", "menu:settings");

  await ctx.reply("Menu", { reply_markup: keyboard });
}

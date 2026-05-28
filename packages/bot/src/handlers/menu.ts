import { InlineKeyboard, type Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerMenuHandlers(bot: Bot<NerifContext>) {
  bot.command("menu", showMenu);
  bot.callbackQuery("menu", showMenu);

  bot.callbackQuery("menu:log", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "Format: /log meal name | kcal | protein | carbs | fat\nExample: /log Chicken rice | 650 | 40 | 70 | 20",
    );
  });


  bot.callbackQuery("menu:burn", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "Format: /burn activity | kcal | minutes\nExample: /burn Running | 350 | 45",
    );
  });

  bot.callbackQuery("menu:weight", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Format: /weight <kg>\nExample: /weight 77.4");
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

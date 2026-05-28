import { InlineKeyboard, type Bot } from "grammy";

import type { NerifContext } from "../context";

const menuKeyboard = new InlineKeyboard()
  .text("🍽️ Log food", "menu:log")
  .text("📸 Scan photo", "menu:scan")
  .row()
  .text("🔥 Log burn", "menu:burn")
  .text("⚖️ Log weight", "menu:weight")
  .row()
  .text("📊 Today", "menu:today")
  .text("📊 Week", "menu:week")
  .row()
  .text("🕐 History", "menu:history")
  .text("🎯 Goals", "menu:goals")
  .row()
  .text("📝 Note", "menu:note")
  .text("⚙️ Settings", "menu:settings");

export function registerMenuHandlers(bot: Bot<NerifContext>) {
  bot.command("menu", showMenu);
  bot.callbackQuery("menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMenu(ctx);
  });

  bot.callbackQuery("menu:log", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      [
        "🍽️ Log a meal",
        "",
        "Send:",
        "/log meal name | kcal | protein | carbs | fat",
        "",
        "Example:",
        "/log Chicken rice | 650 | 40 | 70 | 20",
      ].join("\n"),
      { reply_markup: backToMenuKeyboard() },
    );
  });

  bot.callbackQuery("menu:burn", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      [
        "🔥 Log exercise",
        "",
        "Send:",
        "/burn activity | kcal | minutes",
        "",
        "Example:",
        "/burn Running | 350 | 45",
      ].join("\n"),
      { reply_markup: backToMenuKeyboard() },
    );
  });

  bot.callbackQuery("menu:weight", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      [
        "⚖️ Log today's weight",
        "",
        "Send:",
        "/weight <kg>",
        "",
        "Example:",
        "/weight 77.4",
      ].join("\n"),
      { reply_markup: backToMenuKeyboard() },
    );
  });
}

function backToMenuKeyboard() {
  return new InlineKeyboard().text("← Back to menu", "menu");
}

async function showMenu(ctx: NerifContext) {
  await ctx.reply("What are we doing today?", { reply_markup: menuKeyboard });
}

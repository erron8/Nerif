import { InlineKeyboard, type Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerSettingsHandlers(bot: Bot<NerifContext>) {
  bot.command("settings", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("Profile", "settings:profile")
      .text("Targets", "settings:targets")
      .row()
      .text("Notifications", "settings:notifications")
      .text("DND window", "settings:dnd")
      .row()
      .text("Timezone", "settings:timezone")
      .text("LLM", "settings:llm")
      .row()
      .text("Streak windows", "settings:streak")
      .text("Scan limits", "settings:scan")
      .row()
      .text("Export data", "settings:export")
      .text("Reset", "settings:reset");

    await ctx.reply("Settings", { reply_markup: keyboard });
  });

  bot.callbackQuery(/^settings:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("This settings panel is scaffolded; the edit flow is not wired yet.");
  });

  bot.callbackQuery("menu:settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /settings.");
  });
}

import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerOnboardingHandlers(bot: Bot<NerifContext>) {
  bot.command("start", async (ctx) => {
    if (ctx.userRecord) {
      await ctx.reply(`Welcome back, ${ctx.userRecord.name}. Use /menu.`);
      return;
    }

    await ctx.reply(
      [
        "Nerif is ready.",
        "",
        "Profile onboarding is the next build slice. For now, configure .env, run db:push, and use /menu to verify the bot shell.",
      ].join("\n"),
    );
  });

  bot.command("cancel", async (ctx) => {
    await ctx.reply("Cancelled. Use /menu when you want to pick something else.");
  });
}

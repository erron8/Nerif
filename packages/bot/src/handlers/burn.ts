import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerBurnHandlers(bot: Bot<NerifContext>) {
  bot.command("burn", async (ctx) => {
    await ctx.reply(
      "Burn logging is scaffolded in the schema. Planned format: /burn activity | kcal | minutes.",
    );
  });
}

import type { Bot } from "grammy";

import type { NerifContext } from "../context";

export function registerWeightHandlers(bot: Bot<NerifContext>) {
  bot.command("weight", async (ctx) => {
    await ctx.reply("Weight logging is scaffolded in the schema. Planned format: /weight 77.4.");
  });
}

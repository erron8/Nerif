import type { Bot } from "grammy";

import { notes } from "@nerif/core";

import type { NerifContext } from "../context";

function parseNote(text: string): { content: string; tags: string } | null {
  const raw = text.trim();
  if (!raw) return null;
  const tagMatches = raw.match(/#\w+/g) ?? [];
  const tags = tagMatches.join(",");
  const content = raw.replace(/#\w+/g, "").replace(/\s+/g, " ").trim();
  if (!content) return null;
  return { content, tags };
}

export function registerNoteHandlers(bot: Bot<NerifContext>) {
  bot.command("note", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const parsed = parseNote(ctx.match ?? "");
    if (!parsed) {
      await ctx.reply(
        "📝 Try this format:\n/note <text> [#tag]\n\nExample:\n/note slept 8 hours, feeling great #recovery",
      );
      return;
    }

    await ctx.db.insert(notes).values({
      userId: user.id,
      timestamp: Date.now(),
      content: parsed.content,
      tags: parsed.tags,
    });

    const tagLine = parsed.tags ? `\nTags: ${parsed.tags}` : "";
    await ctx.reply(`✅ Note saved: ${parsed.content}${tagLine}`);
  });

  bot.callbackQuery("menu:note", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("📝 Save a note with /note <text>");
  });
}

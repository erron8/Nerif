import { createConversation, type Conversation } from "@grammyjs/conversations";
import { eq } from "drizzle-orm";
import { InlineKeyboard, type Bot } from "grammy";
import type { Logger } from "pino";

import {
  type AppConfig,
  type NerifDb,
  calculateTdee,
  localDateString,
  suggestFormulaTarget,
  suggestWeightGoalDeadline,
  targets,
  users,
  scanCounts,
} from "@nerif/core";

import type { NerifContext } from "../context";
import { clearUserSchedules, registerUserSchedules } from "../scheduler";

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const parts = s.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function settingsKeyboard() {
  return new InlineKeyboard()
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
}

async function handleSettings(ctx: NerifContext) {
  if (!ctx.userRecord) return;
  await ctx.reply("Settings", { reply_markup: settingsKeyboard() });
}

// --- Targets conversation ---
function createTargetsConversation(db: NerifDb) {
  return async function targetsConversation(
    conversation: Conversation<NerifContext>,
    ctx: NerifContext,
  ) {
    const user = ctx.userRecord;
    if (!user) return;

    const [currentTarget] = await conversation.external(async () =>
      db
        .select()
        .from(targets)
        .where(eq(targets.userId, user.id))
        .orderBy(targets.generatedAt)
        .limit(1),
    );

    if (currentTarget) {
      await ctx.reply(
        [
          "Current targets:",
          `${currentTarget.dailyCalories} kcal`,
          `P${currentTarget.proteinG}g C${currentTarget.carbsG}g F${currentTarget.fatG}g`,
          "",
          "Recalculate or enter manually?",
        ].join("\n"),
        {
          reply_markup: new InlineKeyboard()
            .text("Recalculate (formula)", "targets:formula")
            .text("Enter manually", "targets:manual")
            .text("Cancel", "targets:cancel"),
        },
      );
    } else {
      await ctx.reply("No targets set yet. How do you want to set them?", {
        reply_markup: new InlineKeyboard()
          .text("Use formula", "targets:formula")
          .text("Enter manually", "targets:manual")
          .text("Cancel", "targets:cancel"),
      });
    }

    const choice = await conversation.waitForCallbackQuery([
      "targets:formula",
      "targets:manual",
      "targets:cancel",
    ]);
    await choice.answerCallbackQuery();

    if (choice.callbackQuery.data === "targets:cancel") {
      await ctx.reply("Cancelled.");
      return;
    }

    if (choice.callbackQuery.data === "targets:formula") {
      const formulaTarget = suggestFormulaTarget({
        sex: user.sex,
        age: user.age,
        heightCm: user.heightCm,
        currentWeightKg: user.currentWeightKg,
        targetWeightKg: user.targetWeightKg,
        activityLevel: user.activityLevel,
      });

      await conversation.external(async () => {
        await db.transaction(async (tx) => {
          await tx.delete(targets).where(eq(targets.userId, user.id));
          await tx.insert(targets).values({
            userId: user.id,
            dailyCalories: formulaTarget.dailyCalories,
            proteinG: formulaTarget.proteinG,
            carbsG: formulaTarget.carbsG,
            fatG: formulaTarget.fatG,
            generatedBy: "formula",
          });
        });
      });

      await ctx.reply(
        [
          "Targets updated (formula):",
          `${formulaTarget.dailyCalories} kcal`,
          `P${formulaTarget.proteinG}g C${formulaTarget.carbsG}g F${formulaTarget.fatG}g`,
        ].join("\n"),
      );
      return;
    }

    // Manual entry
    await ctx.reply("Daily calories? (1000-6000)");
    const calResp = await conversation.wait();
    const dailyCalories = Number(calResp.message?.text);
    if (!Number.isFinite(dailyCalories) || dailyCalories < 1000 || dailyCalories > 6000) {
      await ctx.reply("Invalid. Cancelled.");
      return;
    }

    await ctx.reply("Protein (g)? (20-400)");
    const protResp = await conversation.wait();
    const proteinG = Number(protResp.message?.text);
    if (!Number.isFinite(proteinG) || proteinG < 20 || proteinG > 400) {
      await ctx.reply("Invalid. Cancelled.");
      return;
    }

    await ctx.reply("Carbs (g)? (0-800)");
    const carbResp = await conversation.wait();
    const carbsG = Number(carbResp.message?.text);
    if (!Number.isFinite(carbsG) || carbsG < 0 || carbsG > 800) {
      await ctx.reply("Invalid. Cancelled.");
      return;
    }

    await ctx.reply("Fat (g)? (20-300)");
    const fatResp = await conversation.wait();
    const fatG = Number(fatResp.message?.text);
    if (!Number.isFinite(fatG) || fatG < 20 || fatG > 300) {
      await ctx.reply("Invalid. Cancelled.");
      return;
    }

    await conversation.external(async () => {
      await db.transaction(async (tx) => {
        await tx.delete(targets).where(eq(targets.userId, user.id));
        await tx.insert(targets).values({
          userId: user.id,
          dailyCalories,
          proteinG,
          carbsG,
          fatG,
          generatedBy: "user",
        });
      });
    });

    await ctx.reply(
      [
        "Targets updated (manual):",
        `${dailyCalories} kcal`,
        `P${proteinG}g C${carbsG}g F${fatG}g`,
      ].join("\n"),
    );
  };
}

// --- Timezone conversation ---
function createTimezoneConversation(
  db: NerifDb,
  deps: { bot: Bot<NerifContext>; config: AppConfig; logger: Logger },
) {
  return async function timezoneConversation(
    conversation: Conversation<NerifContext>,
    ctx: NerifContext,
  ) {
    const user = ctx.userRecord;
    if (!user) return;

    await ctx.reply(
      `Current timezone: ${user.timezone}\n\nEnter new timezone (e.g. Asia/Makassar, America/New_York):`,
    );
    const resp = await conversation.wait();
    const tz = resp.message?.text?.trim();

    if (!tz || !VALID_TIMEZONES.has(tz)) {
      await ctx.reply("Not a valid IANA timezone. Cancelled.");
      return;
    }

    await conversation.external(async () => {
      await db.update(users).set({ timezone: tz }).where(eq(users.id, user.id));
    });
    ctx.userRecord = { ...user, timezone: tz };

    // Re-register schedules with new timezone
    registerUserSchedules({
      bot: deps.bot,
      config: deps.config,
      db,
      logger: deps.logger,
      user: ctx.userRecord,
    });

    await ctx.reply(`Timezone updated to ${tz}. Schedules re-registered.`);
  };
}

// --- DND conversation ---
function createDndConversation(
  db: NerifDb,
  deps: { bot: Bot<NerifContext>; config: AppConfig; logger: Logger },
) {
  return async function dndConversation(
    conversation: Conversation<NerifContext>,
    ctx: NerifContext,
  ) {
    const user = ctx.userRecord;
    if (!user) return;

    await ctx.reply(
      [
        `Current DND: ${user.dndStart} – ${user.dndEnd}`,
        "",
        "Enter new DND start time (HH:MM, e.g. 22:30):",
      ].join("\n"),
    );
    const startResp = await conversation.wait();
    const dndStart = startResp.message?.text?.trim();
    if (!dndStart || !isValidTime(dndStart)) {
      await ctx.reply("Invalid time. Use HH:MM (00:00–23:59). Cancelled.");
      return;
    }

    await ctx.reply("Enter new DND end time (HH:MM, e.g. 06:30):");
    const endResp = await conversation.wait();
    const dndEnd = endResp.message?.text?.trim();
    if (!dndEnd || !isValidTime(dndEnd)) {
      await ctx.reply("Invalid time. Use HH:MM (00:00–23:59). Cancelled.");
      return;
    }

    await conversation.external(async () => {
      await db
        .update(users)
        .set({ dndStart, dndEnd })
        .where(eq(users.id, user.id));
    });
    ctx.userRecord = { ...user, dndStart, dndEnd };

    // Re-register schedules with new DND
    registerUserSchedules({
      bot: deps.bot,
      config: deps.config,
      db,
      logger: deps.logger,
      user: ctx.userRecord,
    });

    await ctx.reply(`DND window updated: ${dndStart} – ${dndEnd}.`);
  };
}

// --- Scan limits conversation ---
function createScanLimitsConversation(db: NerifDb) {
  return async function scanLimitsConversation(
    conversation: Conversation<NerifContext>,
    ctx: NerifContext,
  ) {
    const user = ctx.userRecord;
    if (!user) return;

    await ctx.reply(
      [
        `Current scan limits: soft=${user.scanSoftLimit ?? "none"}, hard=${user.scanHardLimit ?? "none"}`,
        "",
        "Enter new soft limit (scans/day before warning, or 0 to disable):",
      ].join("\n"),
    );
    const softResp = await conversation.wait();
    const softStr = softResp.message?.text?.trim();
    const softLimit = Number(softStr);
    if (!Number.isFinite(softLimit) || softLimit < 0) {
      await ctx.reply("Invalid. Cancelled.");
      return;
    }

    await ctx.reply("Enter new hard limit (max scans/day, or 0 to disable):");
    const hardResp = await conversation.wait();
    const hardStr = hardResp.message?.text?.trim();
    const hardLimit = Number(hardStr);
    if (!Number.isFinite(hardLimit) || hardLimit < 0) {
      await ctx.reply("Invalid. Cancelled.");
      return;
    }

    if (softLimit > 0 && hardLimit > 0 && softLimit > hardLimit) {
      await ctx.reply("Soft limit cannot exceed hard limit. Cancelled.");
      return;
    }

    await conversation.external(async () => {
      await db
        .update(users)
        .set({
          scanSoftLimit: softLimit > 0 ? softLimit : null,
          scanHardLimit: hardLimit > 0 ? hardLimit : null,
        })
        .where(eq(users.id, user.id));
    });
    ctx.userRecord = {
      ...user,
      scanSoftLimit: softLimit > 0 ? softLimit : null,
      scanHardLimit: hardLimit > 0 ? hardLimit : null,
    };

    await ctx.reply(
      `Scan limits updated: soft=${softLimit > 0 ? softLimit : "none"}, hard=${hardLimit > 0 ? hardLimit : "none"}.`,
    );
  };
}

// --- LLM settings (placeholder) ---
async function handleLlm(ctx: NerifContext) {
  const user = ctx.userRecord;
  if (!user) return;

  await ctx.reply(
    [
      "LLM configuration:",
      `Provider: ${user.llmProvider ?? "not set"}`,
      `Model: ${user.llmModel ?? "not set"}`,
      `API key: ${user.llmApiKeyEncrypted ? "configured" : "not set"}`,
      "",
      "LLM settings will be configurable after Gemini scanning is implemented.",
    ].join("\n"),
  );
}

export function registerSettingsHandlers(
  bot: Bot<NerifContext>,
  deps: { config: AppConfig; db: NerifDb; logger: Logger },
) {
  bot.use(createConversation(createTargetsConversation(deps.db), "settings:targets"));
  bot.use(createConversation(createTimezoneConversation(deps.db, { bot, config: deps.config, logger: deps.logger }), "settings:timezone"));
  bot.use(createConversation(createDndConversation(deps.db, { bot, config: deps.config, logger: deps.logger }), "settings:dnd"));
  bot.use(createConversation(createScanLimitsConversation(deps.db), "settings:scan"));

  bot.command("settings", handleSettings);

  bot.callbackQuery("settings:targets", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("settings:targets");
  });

  bot.callbackQuery("settings:timezone", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("settings:timezone");
  });

  bot.callbackQuery("settings:dnd", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("settings:dnd");
  });

  bot.callbackQuery("settings:scan", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("settings:scan");
  });

  bot.callbackQuery("settings:llm", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleLlm(ctx);
  });

  bot.callbackQuery("settings:profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = ctx.userRecord;
    if (!user) return;
    await ctx.reply(
      [
        `Name: ${user.name}`,
        `Sex: ${user.sex} · Age: ${user.age}`,
        `Height: ${user.heightCm} cm · Weight: ${user.currentWeightKg} kg`,
        `Target: ${user.targetWeightKg} kg`,
        `Activity: ${user.activityLevel}`,
        `Timezone: ${user.timezone}`,
      ].join("\n"),
    );
  });

  bot.callbackQuery("settings:notifications", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = ctx.userRecord;
    if (!user) return;
    await ctx.reply(
      `Notification mode: ${user.notificationMode}\nUse /settings to change.`,
    );
  });

  bot.callbackQuery("settings:streak", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = ctx.userRecord;
    if (!user) return;
    const [t] = await deps.db
      .select()
      .from(targets)
      .where(eq(targets.userId, user.id))
      .limit(1);
    if (!t) {
      await ctx.reply("No targets set. Configure targets first.");
      return;
    }
    await ctx.reply(
      [
        "Streak windows:",
        `Calorie window: ±${t.calorieWindowPct}%`,
        `Protein window: ±${t.proteinWindowPct}%`,
      ].join("\n"),
    );
  });

  bot.callbackQuery("settings:export", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Export is not implemented yet.");
  });

  bot.callbackQuery("settings:reset", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "This will delete all your data. Are you sure?",
      {
        reply_markup: new InlineKeyboard()
          .text("Yes, reset", "settings:reset:confirm")
          .text("Cancel", "settings:reset:cancel"),
      },
    );
  });

  bot.callbackQuery("settings:reset:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = ctx.userRecord;
    if (!user) return;
    clearUserSchedules(user.id);
    await deps.db.delete(users).where(eq(users.id, user.id));
    ctx.userRecord = undefined;
    await ctx.reply("All data deleted. Use /start to begin again.");
  });

  bot.callbackQuery("settings:reset:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Reset cancelled.");
  });

  bot.callbackQuery("menu:settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleSettings(ctx);
  });
}

import { type Conversation, createConversation } from "@grammyjs/conversations";
import { InlineKeyboard, type Bot } from "grammy";
import type { Logger } from "pino";

import {
  type ActivityLevel,
  type Sex,
  type AppConfig,
  type NerifDb,
  calculateTdee,
  suggestFormulaTarget,
  suggestWeightGoalDeadline,
  users,
  targets,
  weightLogs,
} from "@nerif/core";

import type { NerifContext } from "../context";
import { registerUserSchedules } from "../scheduler";

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

const ACTIVITY_OPTIONS: {
  label: string;
  value: ActivityLevel;
  description: string;
}[] = [
  {
    label: "Sedentary",
    value: "sedentary",
    description: "desk job, no exercise",
  },
  { label: "Light", value: "light", description: "1-3 days/week" },
  { label: "Moderate", value: "moderate", description: "3-5 days/week" },
  { label: "Active", value: "active", description: "6-7 days/week" },
  {
    label: "Very active",
    value: "very_active",
    description: "2x per day, heavy training",
  },
];

function parseNumber(text: string): number | null {
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

async function askNumber(
  conversation: Conversation<NerifContext>,
  ctx: NerifContext,
  prompt: string,
  min: number,
  max: number,
): Promise<number> {
  while (true) {
    await ctx.reply(prompt);
    const response = await conversation.wait();
    const text = response.message?.text;
    if (!text) continue;
    if (text.startsWith("/cancel")) {
      await ctx.reply(
        "Cancelled. Use /menu when you want to pick something else.",
      );
      throw new Error("CANCELLED");
    }
    const n = parseNumber(text);
    if (n !== null && n >= min && n <= max) return n;
    await ctx.reply(
      `That doesn't look right. Enter a number between ${min} and ${max}, or /cancel.`,
    );
  }
}

async function askInlineChoice<T extends string>(
  conversation: Conversation<NerifContext>,
  ctx: NerifContext,
  prompt: string,
  options: { label: string; value: T }[],
): Promise<T> {
  const keyboard = new InlineKeyboard();
  for (const opt of options) {
    keyboard.text(opt.label, opt.value).row();
  }
  await ctx.reply(prompt, { reply_markup: keyboard });
  const response = await conversation.waitForCallbackQuery(
    options.map((o) => o.value),
  );
  await response.answerCallbackQuery();
  return response.callbackQuery.data as T;
}

async function askTimezone(
  conversation: Conversation<NerifContext>,
  ctx: NerifContext,
): Promise<string> {
  while (true) {
    await ctx.reply(
      "Enter your timezone (e.g. Asia/Makassar, America/New_York):",
    );
    const tzCtx = await conversation.wait();
    const tz = tzCtx.message?.text?.trim();
    if (tz && VALID_TIMEZONES.has(tz)) return tz;
    await ctx.reply("Not a valid IANA timezone. Try again, or /cancel.");
  }
}

function langCodeToTimezone(code: string | undefined): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    en: "America/New_York",
    id: "Asia/Makassar",
    "id-ID": "Asia/Jakarta",
    ja: "Asia/Tokyo",
    ko: "Asia/Seoul",
    zh: "Asia/Shanghai",
    de: "Europe/Berlin",
    fr: "Europe/Paris",
    es: "Europe/Madrid",
    pt: "America/Sao_Paulo",
    ru: "Europe/Moscow",
    ar: "Asia/Riyadh",
    hi: "Asia/Kolkata",
    th: "Asia/Bangkok",
    vi: "Asia/Ho_Chi_Minh",
  };
  return map[code] ?? null;
}

async function onboarding(
  conversation: Conversation<NerifContext>,
  ctx: NerifContext,
) {
  const telegramId = ctx.from?.id?.toString();
  if (!telegramId) return;

  // Step 1: Name
  await ctx.reply(
    "Welcome to Nerif! Let's set up your profile.\n\nWhat's your name?",
  );
  let name: string;
  while (true) {
    const nameCtx = await conversation.wait();
    const text = nameCtx.message?.text?.trim();
    if (text && text.length > 0) {
      name = text;
      break;
    }
    await ctx.reply("Name can't be empty. Try again, or /cancel.");
  }

  // Step 2: Sex
  const sex = await askInlineChoice(
    conversation,
    ctx,
    "What's your sex? (used for BMR calculation)",
    [
      { label: "Male", value: "M" as const },
      { label: "Female", value: "F" as const },
    ],
  );

  // Step 3: Age
  const age = await askNumber(conversation, ctx, "How old are you?", 10, 120);

  // Step 4: Height
  const heightCm = await askNumber(
    conversation,
    ctx,
    "Height in cm?",
    100,
    250,
  );

  // Step 5: Current weight
  const currentWeightKg = await askNumber(
    conversation,
    ctx,
    "Current weight in kg?",
    20,
    300,
  );

  // Step 6: Target weight
  const targetWeightKg = await askNumber(
    conversation,
    ctx,
    "Target weight in kg?",
    20,
    300,
  );

  // Step 7: Activity level
  const activityLevel = await askInlineChoice(
    conversation,
    ctx,
    "How active are you?",
    ACTIVITY_OPTIONS.map((o) => ({
      label: `${o.label} — ${o.description}`,
      value: o.value,
    })),
  );

  // Step 8: Timezone
  let timezone: string;
  const langCode = ctx.from?.language_code;
  const guessedTz = langCodeToTimezone(langCode);
  if (guessedTz && VALID_TIMEZONES.has(guessedTz)) {
    const useGuessed = await askInlineChoice(
      conversation,
      ctx,
      `Detected timezone: ${guessedTz}. Use this?`,
      [
        { label: `Yes, ${guessedTz}`, value: "yes" as const },
        { label: "No, pick manually", value: "no" as const },
      ],
    );
    timezone =
      useGuessed === "yes"
        ? guessedTz
        : await askTimezone(conversation, ctx);
  } else {
    timezone = await askTimezone(conversation, ctx);
  }

  // Step 9: TDEE suggestion
  const profileData = {
    sex,
    age,
    heightCm,
    currentWeightKg,
    targetWeightKg,
    activityLevel,
  };
  const { bmr, tdee } = calculateTdee({
    sex,
    weightKg: currentWeightKg,
    heightCm,
    age,
    activityLevel,
  });
  const formulaTarget = suggestFormulaTarget(profileData);
  const deadline = suggestWeightGoalDeadline({
    currentWeightKg,
    targetWeightKg,
    from: new Date(),
  });
  const weeksUntil = Math.ceil(
    (deadline.getTime() - Date.now()) / (7 * 86_400_000),
  );

  const tdeeMsg = [
    `Your stats:`,
    `BMR: ${bmr} kcal/day`,
    `TDEE: ${tdee} kcal/day (${activityLevel})`,
    ``,
    `For your target of ${targetWeightKg} kg, suggested daily intake:`,
    `${formulaTarget.dailyCalories} kcal`,
    `Protein: ${formulaTarget.proteinG}g · Carbs: ${formulaTarget.carbsG}g · Fat: ${formulaTarget.fatG}g`,
    ``,
    `Safe timeline: ~${weeksUntil} weeks`,
  ].join("\n");
  await ctx.reply(tdeeMsg);

  // Step 10: Target mode
  const targetMode = await askInlineChoice(
    conversation,
    ctx,
    "How do you want to set your targets?",
    [
      {
        label: `Use suggested (${formulaTarget.dailyCalories} kcal)`,
        value: "formula" as const,
      },
      { label: "Enter manually", value: "manual" as const },
      { label: "Skip for now", value: "skipped" as const },
    ],
  );

  let dailyCalories = formulaTarget.dailyCalories;
  let proteinG = formulaTarget.proteinG;
  let carbsG = formulaTarget.carbsG;
  let fatG = formulaTarget.fatG;

  if (targetMode === "manual") {
    dailyCalories = await askNumber(
      conversation,
      ctx,
      "Daily calories?",
      1000,
      6000,
    );
    proteinG = await askNumber(conversation, ctx, "Protein (g)?", 20, 400);
    carbsG = await askNumber(conversation, ctx, "Carbs (g)?", 0, 800);
    fatG = await askNumber(conversation, ctx, "Fat (g)?", 20, 300);
  }

  // Step 11: Save to DB
  let savedUser: typeof users.$inferSelect;
  try {
    savedUser = await conversation.external(async () => {
      const db = ctx.db;

      const [user] = await db
        .insert(users)
        .values({
          telegramId,
          name: name!,
          sex: sex as Sex,
          age,
          heightCm,
          activityLevel: activityLevel as ActivityLevel,
          startingWeightKg: currentWeightKg,
          currentWeightKg,
          targetWeightKg,
          targetMode:
            targetMode === "formula"
              ? "manual"
              : (targetMode as "manual" | "skipped"),
          timezone,
        })
        .returning();
      if (!user) throw new Error("Failed to insert user");

      const today = new Date().toISOString().split("T")[0]!;
      await db.insert(weightLogs).values({
        userId: user.id,
        date: today,
        weightKg: currentWeightKg,
      });

      if (targetMode !== "skipped") {
        await db.insert(targets).values({
          userId: user.id,
          dailyCalories,
          proteinG,
          carbsG,
          fatG,
          generatedBy: targetMode === "formula" ? "formula" : "user",
        });
      }

      return user;
    });
  } catch (err) {
    if ((err as Error).message === "CANCELLED") return;
    throw err;
  }

  ctx.userRecord = savedUser;

  // Step 12: Confirm
  const summary = [
    `Profile saved!`,
    ``,
    `Name: ${name!}`,
    `Sex: ${sex} · Age: ${age}`,
    `Height: ${heightCm} cm · Weight: ${currentWeightKg} kg`,
    `Target: ${targetWeightKg} kg`,
    `Activity: ${activityLevel}`,
    `Timezone: ${timezone}`,
  ];

  if (targetMode !== "skipped") {
    summary.push(
      ``,
      `Daily targets: ${dailyCalories} kcal`,
      `Protein: ${proteinG}g · Carbs: ${carbsG}g · Fat: ${fatG}g`,
    );
  } else {
    summary.push(``, `Targets: skipped — set them later via /settings`);
  }

  summary.push(``, `Use /menu to get started.`);

  await ctx.reply(summary.join("\n"));
}

export function registerOnboardingHandlers(
  bot: Bot<NerifContext>,
  deps: { config: AppConfig; db: NerifDb; logger: Logger },
) {
  bot.use(createConversation(onboarding));

  bot.command("start", async (ctx) => {
    if (ctx.userRecord) {
      await ctx.reply(`Welcome back, ${ctx.userRecord.name}. Use /menu.`);
      return;
    }

    await ctx.conversation.enter("onboarding");

    // After conversation completes, register schedules if user was created
    if (ctx.userRecord) {
      registerUserSchedules({
        bot,
        config: deps.config,
        logger: deps.logger,
        user: ctx.userRecord,
      });
    }
  });

  bot.command("cancel", async (ctx) => {
    await ctx.reply(
      "Cancelled. Use /menu when you want to pick something else.",
    );
  });
}

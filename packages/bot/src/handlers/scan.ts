import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Bot } from "grammy";
import type { Logger } from "pino";

import {
  type AppConfig,
  type NerifDb,
  analysisLogs,
  mealItems,
  meals,
  buildImagePath,
  checkScanLimit,
  incrementScanCount,
  localDateString,
  readFoodScanPrompt,
  scanFoodImage,
} from "@nerif/core";

import type { NerifContext } from "../context";

async function handleScan(ctx: NerifContext) {
  await ctx.reply("📸 Send a food photo and I'll analyze it.");
}

function extensionFromFilePath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  return "jpg";
}

function mimeTypeFromExtension(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export function registerScanHandlers(
  bot: Bot<NerifContext>,
  deps: { config: AppConfig; db: NerifDb; logger: Logger },
) {
  bot.command("scan", handleScan);

  bot.callbackQuery("menu:scan", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleScan(ctx);
  });

  bot.on("message:photo", async (ctx) => {
    const user = ctx.userRecord;
    if (!user) return;

    const photo = ctx.message.photo;
    if (!photo || photo.length === 0) return;

    const today = localDateString(new Date(), user.timezone);

    // --- Rate limit check ---
    // null in DB means "disabled" (user explicitly removed limit via settings);
    // undefined means "not configured" → fall back to env defaults.
    const softLimit = user.scanSoftLimit === null ? 0 : (user.scanSoftLimit ?? deps.config.SCAN_SOFT_LIMIT);
    const hardLimit = user.scanHardLimit === null ? 0 : (user.scanHardLimit ?? deps.config.SCAN_HARD_LIMIT);

    const limit = await checkScanLimit(deps.db, {
      userId: user.id,
      date: today,
      softLimit,
      hardLimit,
    });

    if (limit.status === "hard") {
      await ctx.reply(
        `📸 Daily scan limit reached (${limit.count}/${hardLimit}). Try again tomorrow.`,
      );
      return;
    }

    if (limit.status === "soft") {
      await ctx.reply(
        `📸 Approaching scan limit (${limit.count}/${softLimit}). This will still work but consider logging manually.`,
      );
    }

    // --- Download photo ---
    const largest = photo[photo.length - 1]!;
    let file;
    try {
      file = await ctx.api.getFile(largest.file_id);
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "failed to get file info");
      await ctx.reply("❌ Couldn't download the photo. Try again.");
      return;
    }

    if (!file.file_path) {
      await ctx.reply("❌ Couldn't download the photo. Try again.");
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${deps.config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    let imageBuffer: Buffer;
    try {
      const resp = await fetch(fileUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      imageBuffer = Buffer.from(await resp.arrayBuffer());
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "failed to download photo");
      await ctx.reply("❌ Couldn't download the photo. Try again.");
      return;
    }

    // --- Save image to disk ---
    const ext = extensionFromFilePath(file.file_path);
    const mimeType = mimeTypeFromExtension(ext);
    const imagePath = buildImagePath(
      deps.config.IMAGES_DIR,
      user.id,
      today,
      largest.file_id.slice(-12),
      ext,
    );

    try {
      mkdirSync(dirname(imagePath), { recursive: true });
      writeFileSync(imagePath, imageBuffer);
    } catch (err) {
      deps.logger.error({ err, imagePath }, "failed to save image");
      await ctx.reply("❌ Couldn't save the image. Try again.");
      return;
    }

    // --- Scan with Gemini ---
    await ctx.reply("📸 Analyzing photo...");

    let raw: string;
    let modelName: string;
    let parsed;
    try {
      const prompt = await readFoodScanPrompt();
      const result = await scanFoodImage({
        apiKey: deps.config.GEMINI_API_KEY,
        imagePath,
        prompt,
        ...(deps.config.USER_LLM_MODEL ? { model: deps.config.USER_LLM_MODEL } : {}),
        mimeType,
      });
      raw = result.raw;
      modelName = result.modelName;
      parsed = result.parsed;
    } catch (err) {
      // Log the error + any raw output we might have
      deps.logger.error({ err, userId: user.id }, "Gemini scan failed");

      // Try to save raw output if available (from Zod validation failure)
      const rawOutput =
        err instanceof Error && "raw" in err
          ? (err as { raw: string }).raw
          : null;

      await deps.db.insert(analysisLogs).values({
        modelName: deps.config.USER_LLM_MODEL ?? "gemini-2.5-flash",
        promptVersion: deps.config.PROMPT_VERSION,
        rawAiOutput: rawOutput ?? "",
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      // Clean up orphaned image file
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(imagePath);
      } catch {}

      await ctx.reply(
        "❌ Couldn't analyze the photo. Try again or log manually with /log.",
      );
      return;
    }

    // --- Save meal + items + analysis log transactionally ---
    let savedMealId: number;
    try {
      savedMealId = await deps.db.transaction(async (tx) => {
        const [meal] = await tx
          .insert(meals)
          .values({
            userId: user.id,
            timestamp: Date.now(),
            source: "scan",
            mealName: parsed.meal_name,
            totalCalories: parsed.totals.calories,
            totalProteinG: parsed.totals.protein_g,
            totalCarbsG: parsed.totals.carbs_g,
            totalFatG: parsed.totals.fat_g,
            overallConfidence: parsed.overall_confidence,
            imagePath,
          })
          .returning();

        const mealId = meal!.id;

        await tx.insert(mealItems).values(
          parsed.items.map((item) => ({
            mealId,
            foodName: item.food_name,
            estimatedQuantity: item.estimated_quantity,
            servingUnit: item.serving_unit,
            calories: item.calories,
            proteinG: item.protein_g,
            carbsG: item.carbs_g,
            fatG: item.fat_g,
            confidence: item.confidence,
            notes: item.notes,
          })),
        );

        await tx.insert(analysisLogs).values({
          mealId,
          modelName,
          promptVersion: deps.config.PROMPT_VERSION,
          rawAiOutput: raw,
          parsedOutput: JSON.stringify(parsed),
        });

        return mealId;
      });
    } catch (err) {
      deps.logger.error({ err, userId: user.id }, "failed to save scan results");

      // Clean up orphaned image — Gemini succeeded but DB save failed
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(imagePath);
      } catch {}

      await ctx.reply("❌ Couldn't save the scan results. Try again or log manually with /log.");
      return;
    }

    // --- Increment scan count after successful save ---
    await incrementScanCount(deps.db, { userId: user.id, date: today });

    // --- Reply with estimate summary ---
    const confidencePct = Math.round(parsed.overall_confidence * 100);
    const itemLines = parsed.items.map(
      (i) =>
        `  ${i.food_name}: ${i.calories} kcal (P${i.protein_g}g C${i.carbs_g}g F${i.fat_g}g) [${Math.round(i.confidence * 100)}%]`,
    );

    const lines = [
      `📸 ${parsed.meal_name}`,
      "",
      ...itemLines,
      "",
      `Total: ${parsed.totals.calories} kcal · P${parsed.totals.protein_g}g C${parsed.totals.carbs_g}g F${parsed.totals.fat_g}g`,
      `Confidence: ${confidencePct}%`,
    ];

    if (parsed.assumptions.length > 0) {
      lines.push("", "Notes:", ...parsed.assumptions.map((a) => `  - ${a}`));
    }

    if (parsed.uncertainty_notes.length > 0) {
      lines.push("", "⚠️ Uncertainty:", ...parsed.uncertainty_notes.map((n) => `  - ${n}`));
    }

    lines.push("", "AI estimate. Use /log to correct if needed.");

    await ctx.reply(lines.join("\n"));
  });
}

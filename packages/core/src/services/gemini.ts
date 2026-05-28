import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const ScanResultSchema = z.object({
  meal_name: z.string().min(1),
  items: z
    .array(
      z.object({
        food_name: z.string().min(1),
        estimated_quantity: z.number().nonnegative(),
        serving_unit: z.string().min(1),
        visual_description: z.string().min(1),
        calories: z.number().nonnegative(),
        protein_g: z.number().nonnegative(),
        carbs_g: z.number().nonnegative(),
        fat_g: z.number().nonnegative(),
        confidence: z.number().min(0).max(1),
        notes: z.string().optional(),
      }),
    )
    .min(1),
  totals: z.object({
    calories: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
  }),
  overall_confidence: z.number().min(0).max(1),
  assumptions: z.array(z.string()),
  uncertainty_notes: z.array(z.string()),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

export const TargetAnalysisSchema = z
  .object({
    tdee_kcal: z.number().nonnegative(),
    daily_calories: z.number().min(1200).max(4500),
    deficit_or_surplus_kcal: z.number(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    macro_split_pct: z.object({
      protein: z.number().nonnegative(),
      carbs: z.number().nonnegative(),
      fat: z.number().nonnegative(),
    }),
    weekly_weight_change_kg: z.number(),
    target_body_fat_pct: z.number().nullable(),
    target_muscle_mass_kg: z.number().nullable(),
    timeline_realistic: z.boolean(),
    rationale: z.string().min(1).max(500),
    warnings: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    const macroCalories =
      value.protein_g * 4 + value.carbs_g * 4 + value.fat_g * 9;
    const macroDelta = Math.abs(macroCalories - value.daily_calories);
    if (macroDelta > value.daily_calories * 0.05) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "macros must sum to calories within 5%",
        path: ["daily_calories"],
      });
    }

    const splitTotal =
      value.macro_split_pct.protein +
      value.macro_split_pct.carbs +
      value.macro_split_pct.fat;
    if (Math.abs(splitTotal - 100) > 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "macro split must sum to 100 within 2 points",
        path: ["macro_split_pct"],
      });
    }
  });

export type TargetAnalysis = z.infer<typeof TargetAnalysisSchema>;

export interface ScanImageResult {
  parsed: ScanResult;
  raw: string;
  modelName: string;
}

/**
 * Scan a food image with Gemini and return parsed result + raw output.
 * Throws on Gemini API failure or Zod validation failure.
 */
export async function scanFoodImage(input: {
  apiKey: string;
  imagePath: string;
  prompt: string;
  model?: string;
  mimeType?: string;
}): Promise<ScanImageResult> {
  const modelName = input.model ?? "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const imageBytes = await Bun.file(input.imagePath).bytes();
  const data = Buffer.from(imageBytes).toString("base64");

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [
          { text: input.prompt },
          {
            inlineData: {
              mimeType: input.mimeType ?? "image/jpeg",
              data,
            },
          },
        ],
      },
    ],
  });

  const raw = response.text ?? "";

  try {
    const parsed = parseJsonResponse(raw, ScanResultSchema);
    return { parsed, raw, modelName };
  } catch (err) {
    // Attach raw output to the error so callers can log it
    (err as any).raw = raw;
    throw err;
  }
}

export async function analyzeTarget(input: {
  apiKey: string;
  prompt: string;
  profileJson: unknown;
  model?: string;
}): Promise<TargetAnalysis> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const response = await ai.models.generateContent({
    model: input.model ?? "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: input.prompt },
          { text: JSON.stringify(input.profileJson) },
        ],
      },
    ],
  });

  return parseJsonResponse(response.text ?? "", TargetAnalysisSchema);
}

function parseJsonResponse<T>(raw: string, schema: z.ZodType<T>) {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  return schema.parse(JSON.parse(trimmed));
}

/**
 * Build a stable image storage path: IMAGES_DIR/userId/YYYY-MM-DD/timestamp-fileId.ext
 */
export function buildImagePath(
  imagesDir: string,
  userId: number,
  date: string,
  fileId: string,
  ext = "jpg",
): string {
  return `${imagesDir}/${userId}/${date}/${Date.now()}-${fileId}.${ext}`;
}

/**
 * Read the food scan prompt from the package's prompts directory.
 */
export async function readFoodScanPrompt(): Promise<string> {
  // gemini.ts is at src/services/, prompt is at src/prompts/
  return Bun.file(new URL("../prompts/food-scan-v1.txt", import.meta.url)).text();
}

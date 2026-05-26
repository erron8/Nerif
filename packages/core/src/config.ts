import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  USER_LLM_PROVIDER: z.string().default("gemini"),
  USER_LLM_MODEL: z.string().optional(),
  DB_PATH: z.string().default("./data/nerif.db"),
  IMAGES_DIR: z.string().default("./data/images"),
  SCAN_SOFT_LIMIT: z.coerce.number().int().positive().default(15),
  SCAN_HARD_LIMIT: z.coerce.number().int().positive().default(30),
  DEFAULT_DND_START: z.string().default("22:30"),
  DEFAULT_DND_END: z.string().default("06:30"),
  LOG_LEVEL: z.string().default("info"),
  PROMPT_VERSION: z.string().default("v1"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = envSchema.parse(env);

  if (config.SCAN_SOFT_LIMIT > config.SCAN_HARD_LIMIT) {
    throw new Error("SCAN_SOFT_LIMIT must be <= SCAN_HARD_LIMIT");
  }

  return config;
}

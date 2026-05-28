import { createDatabase, loadConfig } from "@nerif/core";
import pino from "pino";

import { createBot } from "./bot";
import { registerSchedules } from "./scheduler";

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const db = createDatabase(config.DB_PATH);
const bot = createBot({ config, db, logger });

try {
  await bot.api.setMyCommands([
    { command: "start", description: "👋 Set up or reopen Nerif" },
    { command: "menu", description: "🏠 Open the main menu" },
    { command: "log", description: "🍽️ Log food manually" },
    { command: "scan", description: "📸 Scan food from a photo" },
    { command: "today", description: "📊 Show today's totals" },
    { command: "week", description: "📊 Show the last 7 days" },
    { command: "history", description: "🕐 Show today's meals" },
    { command: "delete_last", description: "↩️ Undo the last meal" },
    { command: "weight", description: "⚖️ Log today's weight" },
    { command: "goals", description: "🎯 View goals" },
    { command: "note", description: "📝 Add a note" },
    { command: "export", description: "⚙️ Export data" },
    { command: "settings", description: "⚙️ Open settings" },
    { command: "cancel", description: "← Cancel the current flow" },
  ]);
} catch (error) {
  logger.warn({ err: error }, "failed to register telegram commands");
}

await registerSchedules({ bot, config, db, logger });

logger.info("nerif bot starting");
bot.start({
  onStart: (botInfo) => {
    logger.info({ username: botInfo.username }, "nerif bot started");
  },
});

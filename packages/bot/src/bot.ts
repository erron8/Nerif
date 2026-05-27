import { conversations } from "@grammyjs/conversations";
import { Bot, GrammyError, HttpError, session } from "grammy";
import type { Logger } from "pino";

import type { AppConfig, NerifDb } from "@nerif/core";

import type { NerifContext, SessionData } from "./context";
import { registerBurnHandlers } from "./handlers/burn";
import { registerExportHandlers } from "./handlers/export";
import { registerGoalHandlers } from "./handlers/goals";
import { registerIntakeHandlers } from "./handlers/intake";
import { registerMenuHandlers } from "./handlers/menu";
import { registerNoteHandlers } from "./handlers/notes";
import { registerOnboardingHandlers } from "./handlers/onboarding";
import { registerProgressHandlers } from "./handlers/progress";
import { registerScanHandlers } from "./handlers/scan";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerWeightHandlers } from "./handlers/weight";
import { userLoadMiddleware } from "./middleware/user-load";

export function createBot(input: {
  config: AppConfig;
  db: NerifDb;
  logger: Logger;
}) {
  const bot = new Bot<NerifContext>(input.config.TELEGRAM_BOT_TOKEN);

  // Expose db on context
  bot.use((ctx, next) => {
    (ctx as NerifContext).db = input.db;
    return next();
  });

  bot.use(
    session({
      initial: (): SessionData => ({}),
    }),
  );
  bot.use(conversations());
  bot.use(userLoadMiddleware(input.db, input.logger));

  registerOnboardingHandlers(bot, input);
  registerMenuHandlers(bot);
  registerIntakeHandlers(bot);
  registerScanHandlers(bot);
  registerBurnHandlers(bot);
  registerWeightHandlers(bot);
  registerProgressHandlers(bot);
  registerGoalHandlers(bot);
  registerNoteHandlers(bot);
  registerSettingsHandlers(bot);
  registerExportHandlers(bot);

  bot.catch((error) => {
    const ctx = error.ctx;
    const err = error.error;

    if (err instanceof GrammyError) {
      input.logger.error(
        { err, userId: ctx.from?.id, description: err.description },
        "telegram api error",
      );
    } else if (err instanceof HttpError) {
      input.logger.error({ err, userId: ctx.from?.id }, "telegram http error");
    } else {
      input.logger.error({ err, userId: ctx.from?.id }, "unhandled bot error");
    }
  });

  return bot;
}

import { Cron } from "croner";
import type { Bot } from "grammy";
import type { Logger } from "pino";

import type { AppConfig, NerifDb } from "@nerif/core";
import { users } from "@nerif/core";

import type { NerifContext } from "./context";

const jobs = new Map<string, Cron>();

export async function registerSchedules(input: {
  bot: Bot<NerifContext>;
  config: AppConfig;
  db: NerifDb;
  logger: Logger;
}) {
  const allUsers = await input.db.select().from(users);
  for (const user of allUsers) {
    registerUserSchedules({ ...input, user });
  }

  input.logger.info({ count: allUsers.length }, "registered schedules");
}

export function registerUserSchedules(input: {
  bot: Bot<NerifContext>;
  config: AppConfig;
  logger: Logger;
  user: typeof users.$inferSelect;
}) {
  clearUserSchedules(input.user.id);

  const morningId = `${input.user.id}:morning`;
  jobs.set(
    morningId,
    new Cron("0 7 * * *", { timezone: input.user.timezone }, async () => {
      if (isInDndWindow(new Date(), input.user.dndStart, input.user.dndEnd)) {
        return;
      }

      await input.bot.api.sendMessage(
        input.user.telegramId,
        "Morning check-in: log today's weight when you can.",
      );
    }),
  );
}

export function clearUserSchedules(userId: number) {
  for (const [id, job] of jobs.entries()) {
    if (id.startsWith(`${userId}:`)) {
      job.stop();
      jobs.delete(id);
    }
  }
}

export function isInDndWindow(now: Date, start: string, end: string) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);

  if (startMinutes <= endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }

  return minutes >= startMinutes || minutes < endMinutes;
}

function parseTime(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

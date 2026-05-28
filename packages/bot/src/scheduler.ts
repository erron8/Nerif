import { Cron } from "croner";
import type { Bot } from "grammy";
import type { Logger } from "pino";

import type { AppConfig, NerifDb } from "@nerif/core";
import { aggregateUserToday, users } from "@nerif/core";

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
  db: NerifDb;
  logger: Logger;
  user: typeof users.$inferSelect;
}) {
  clearUserSchedules(input.user.id);

  // Morning check-in
  const morningId = `${input.user.id}:morning`;
  jobs.set(
    morningId,
    new Cron("0 7 * * *", { timezone: input.user.timezone }, async () => {
      if (isInDndWindow(new Date(), input.user.dndStart, input.user.dndEnd, input.user.timezone)) {
        // Retry at 08:00 if DND suppressed the 07:00 check-in
        const retryId = `${input.user.id}:morning-retry`;
        const existing = jobs.get(retryId);
        if (existing) existing.stop();
        jobs.set(
          retryId,
          new Cron("0 8 * * *", { timezone: input.user.timezone }, async () => {
            jobs.delete(retryId);
            await input.bot.api.sendMessage(
              input.user.telegramId,
              "Morning check-in: log today's weight when you can.",
            );
          }),
        );
        return;
      }

      await input.bot.api.sendMessage(
        input.user.telegramId,
        "Morning check-in: log today's weight when you can.",
      );
    }),
  );

  // End-of-day aggregation — runs at 23:59 user-local
  const eodId = `${input.user.id}:eod`;
  jobs.set(
    eodId,
    new Cron("59 23 * * *", { timezone: input.user.timezone }, async () => {
      try {
        const result = await aggregateUserToday(input.db, input.user);
        if (!result) return;

        const icon = result.streakHit ? "✓" : "✗";
        await input.bot.api.sendMessage(
          input.user.telegramId,
          [
            `Day summary: ${icon}`,
            `${result.caloriesIn} kcal in · ${result.caloriesBurned} burned`,
            `Streak: ${result.streakCountAfter} day${result.streakCountAfter === 1 ? "" : "s"}`,
          ].join("\n"),
        );
      } catch (err) {
        input.logger.error(
          { err, userId: input.user.id },
          "end-of-day aggregation failed",
        );
      }
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

export function isInDndWindow(
  now: Date,
  start: string,
  end: string,
  timezone?: string,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const minutes = get("hour") * 60 + get("minute");
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

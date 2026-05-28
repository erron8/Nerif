/**
 * Returns YYYY-MM-DD in the given IANA timezone.
 */
export function localDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

/**
 * Returns YYYY-MM-DD for the next calendar day in the given timezone.
 */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0]!;
}

/**
 * Get the UTC offset in ms at a given UTC instant for a timezone.
 * offset = local - UTC (positive east of Greenwich).
 */
function getOffsetAt(utcMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const localMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return localMs - utcMs;
}

/**
 * Compute the UTC instant of local midnight (00:00) for a given date
 * in the given IANA timezone. Correctly handles DST transitions by
 * converging the offset at the candidate midnight.
 */
function localMidnightToUtc(date: string, timezone: string): number {
  // Use noon as initial anchor — safe starting point in the target local day
  const noonUtc = new Date(`${date}T12:00:00Z`).getTime();
  let offset = getOffsetAt(noonUtc, timezone);
  const baseUtc = new Date(`${date}T00:00:00Z`).getTime();

  // Converge: if the offset at the candidate midnight differs from the
  // offset used to compute it (DST transition), recompute with the
  // actual offset. At most 2 iterations needed.
  for (let i = 0; i < 2; i++) {
    const candidate = baseUtc - offset;
    const actualOffset = getOffsetAt(candidate, timezone);
    if (actualOffset === offset) return candidate;
    offset = actualOffset;
  }

  return baseUtc - offset;
}

/**
 * Returns the UTC millisecond timestamps for the start (inclusive) and
 * end (exclusive) of a local calendar day in the given IANA timezone.
 *
 * Handles DST transitions correctly — the end is computed independently
 * as the next local midnight, not start + 24h.
 */
export function toUtcBounds(
  date: string,
  timezone: string,
): { start: number; end: number } {
  const start = localMidnightToUtc(date, timezone);
  const end = localMidnightToUtc(nextDay(date), timezone);
  return { start, end };
}

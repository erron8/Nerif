/**
 * Returns YYYY-MM-DD in the given IANA timezone.
 */
export function localDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

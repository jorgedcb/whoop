/**
 * Date input handling for range queries.
 *
 * WHOOP requires full ISO 8601 datetimes, but "YYYY-MM-DD" is what people
 * (and models) naturally write. Values without a timezone (date-only, or a
 * datetime with no `Z`/offset) are interpreted in the server's local timezone.
 */
import { z } from "zod";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepts `YYYY-MM-DD` or an ISO 8601 datetime (with or without an offset).
 * Calendar-invalid values such as `2026-02-30` are rejected rather than rolled over.
 */
export const dateOrDatetime = z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })], {
  error: "Expected YYYY-MM-DD or an ISO 8601 datetime",
});

/**
 * Expand a date-only string to an ISO datetime at local midnight.
 * For `end`, a date-only value is treated as inclusive (midnight of the next day).
 * Full datetimes are re-serialised as UTC ISO via `toISOString`; a datetime with
 * no offset is read as local time first.
 */
export function toIso(value: string | undefined, boundary: "start" | "end"): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_ONLY.test(value)) return new Date(value).toISOString();
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d + (boundary === "end" ? 1 : 0)).toISOString();
}

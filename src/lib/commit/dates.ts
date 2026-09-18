// Pure date arithmetic for Commit.
// All dates are handled as calendar dates (yyyy-mm-dd) so that a display
// timezone can never move a stored contractual instant.

import type { IntervalUnit, Recurrence } from "./types";

export type ISODate = string; // yyyy-mm-dd

export function toISODate(d: Date): ISODate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse yyyy-mm-dd into a UTC Date at midnight. */
export function parseISODate(s: ISODate): Date {
  const parts = s.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayISO(): ISODate {
  const now = new Date();
  return toISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Add whole months while preserving the day-of-month anchor.
 * 31 January + 1 month -> 28/29 February; + 2 months -> 31 March.
 * The anchor day is never permanently lost.
 */
export function addMonthsPreservingAnchor(
  date: ISODate,
  months: number,
  anchorDay: number,
): ISODate {
  const d = parseISODate(date);
  const targetMonth = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(anchorDay, lastDayOfMonth(year, monthIndex));
  return toISODate(new Date(Date.UTC(year, monthIndex, day)));
}

/**
 * Add whole years. A 29 February anchor follows the disclosed last-valid-day
 * rule: it becomes 28 February in non-leap years and returns to 29 February
 * whenever the year allows it.
 */
export function addYearsPreservingAnchor(
  date: ISODate,
  years: number,
  anchorMonthIndex: number,
  anchorDay: number,
): ISODate {
  const d = parseISODate(date);
  const year = d.getUTCFullYear() + years;
  const day = Math.min(anchorDay, lastDayOfMonth(year, anchorMonthIndex));
  return toISODate(new Date(Date.UTC(year, anchorMonthIndex, day)));
}

export function advance(date: ISODate, recurrence: Recurrence): ISODate {
  const anchor = parseISODate(recurrence.anchorDate);
  const anchorDay = anchor.getUTCDate();
  const anchorMonth = anchor.getUTCMonth();
  const n = Math.max(1, Math.round(recurrence.intervalCount));

  switch (recurrence.intervalUnit) {
    case "day":
      return addDays(date, n);
    case "week":
      return addDays(date, n * 7);
    case "month":
      return addMonthsPreservingAnchor(date, n, anchorDay);
    case "year":
      return addYearsPreservingAnchor(date, n, anchorMonth, anchorDay);
  }
}

/** Generate billing occurrences from `start` up to and including `until`. */
export function occurrencesBetween(
  start: ISODate,
  recurrence: Recurrence,
  from: ISODate,
  until: ISODate,
  maxCount = 400,
): ISODate[] {
  const out: ISODate[] = [];
  let cursor = start;
  let guard = 0;
  // Wind forward to the window.
  while (cursor < from && guard++ < maxCount) cursor = advance(cursor, recurrence);
  guard = 0;
  while (cursor <= until && guard++ < maxCount) {
    out.push(cursor);
    cursor = advance(cursor, recurrence);
  }
  return out;
}

export const INTERVAL_UNIT_LABEL: Record<IntervalUnit, [string, string]> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
  year: ["year", "years"],
};

export function describeRecurrence(r: Recurrence | null): string {
  if (!r) return "No recurring schedule recorded";
  const [one, many] = INTERVAL_UNIT_LABEL[r.intervalUnit];
  if (r.intervalCount === 1) {
    return r.intervalUnit === "month"
      ? "Monthly"
      : r.intervalUnit === "year"
        ? "Yearly"
        : r.intervalUnit === "week"
          ? "Weekly"
          : "Daily";
  }
  return `Every ${r.intervalCount} ${many ?? one}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatLongDate(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDayMonth(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatWeekdayLong(date: ISODate): string {
  const d = parseISODate(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`;
}

export function relativeDayLabel(date: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  return `in ${diff} days`;
}

export { MONTHS, WEEKDAYS };

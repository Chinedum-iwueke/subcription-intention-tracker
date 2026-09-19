// Spending and coverage analytics.
// Currencies are grouped by their original currency and NEVER summed together.
// Unknown amounts are a real value with a reason — they are counted, not zeroed.

import { addDays, occurrencesBetween, parseISODate, toISODate, todayISO, type ISODate } from "./dates";
import { isResolved } from "./derive";
import { annualEquivalentMinor, monthlyEquivalentMinor } from "./money";
import type { Commitment, UnknownReason } from "./types";

export interface CurrencyLine {
  commitment: Commitment;
  monthlyMinor: number;
  annualMinor: number;
}

export interface CurrencyGroup {
  currency: string;
  monthlyMinor: number;
  annualMinor: number;
  lines: CurrencyLine[];
}

export interface UnpricedLine {
  commitment: Commitment;
  reason: UnknownReason | "no_schedule";
}

export interface CoverageReport {
  groups: CurrencyGroup[];
  unpriced: UnpricedLine[];
  /** Commitments in scope: not canceled, not expired. */
  inScope: number;
  priced: number;
}

export function isInScope(c: Commitment): boolean {
  return !isResolved(c) && c.lifecycle !== "canceled" && c.lifecycle !== "expired";
}

export function buildCoverage(commitments: Commitment[]): CoverageReport {
  const scope = commitments.filter(isInScope);
  const byCurrency = new Map<string, CurrencyGroup>();
  const unpriced: UnpricedLine[] = [];

  for (const c of scope) {
    const monthly = monthlyEquivalentMinor(c.terms);
    const annual = annualEquivalentMinor(c.terms);
    if (monthly === null || annual === null) {
      unpriced.push({
        commitment: c,
        reason: !c.terms.recurrence
          ? "no_schedule"
          : (c.terms.amountUnknownReason ?? "no_evidence"),
      });
      continue;
    }
    const group = byCurrency.get(c.terms.currency) ?? {
      currency: c.terms.currency,
      monthlyMinor: 0,
      annualMinor: 0,
      lines: [],
    };
    group.monthlyMinor += monthly;
    group.annualMinor += annual;
    group.lines.push({ commitment: c, monthlyMinor: monthly, annualMinor: annual });
    byCurrency.set(c.terms.currency, group);
  }

  const groups = [...byCurrency.values()]
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => b.monthlyMinor - a.monthlyMinor) }))
    .sort((a, b) => b.monthlyMinor - a.monthlyMinor);

  return { groups, unpriced, inScope: scope.length, priced: scope.length - unpriced.length };
}

// ------------------------------------------------------------ scheduled bills

export interface ScheduledBill {
  id: string;
  commitment: Commitment;
  date: ISODate;
  amountMinor: number | null;
  currency: string;
  estimated: boolean;
}

export function scheduledBills(
  commitments: Commitment[],
  from: ISODate,
  to: ISODate,
): ScheduledBill[] {
  const out: ScheduledBill[] = [];
  for (const c of commitments) {
    if (!isInScope(c) || !c.nextBillDate) continue;
    const dates = c.terms.recurrence
      ? occurrencesBetween(c.nextBillDate, c.terms.recurrence, from, to)
      : c.nextBillDate >= from && c.nextBillDate <= to
        ? [c.nextBillDate]
        : [];
    for (const date of dates) {
      if (c.renewalStopDate && date > c.renewalStopDate) continue;
      out.push({
        id: `${c.id}-${date}`,
        commitment: c,
        date,
        amountMinor: c.terms.amountMinor,
        currency: c.terms.currency,
        estimated: c.nextBillEstimated || c.terms.amountMinor === null,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CurrencyBucket {
  currency: string;
  totalMinor: number;
  count: number;
  unknownCount: number;
  estimatedCount: number;
}

export function bucketByCurrency(bills: ScheduledBill[]): CurrencyBucket[] {
  const map = new Map<string, CurrencyBucket>();
  for (const b of bills) {
    const bucket = map.get(b.currency) ?? {
      currency: b.currency,
      totalMinor: 0,
      count: 0,
      unknownCount: 0,
      estimatedCount: 0,
    };
    bucket.count += 1;
    if (b.amountMinor === null) bucket.unknownCount += 1;
    else bucket.totalMinor += b.amountMinor;
    if (b.estimated) bucket.estimatedCount += 1;
    map.set(b.currency, bucket);
  }
  return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

export function monthBounds(date: ISODate): { start: ISODate; end: ISODate; label: string } {
  const d = parseISODate(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = toISODate(new Date(Date.UTC(y, m, 1)));
  const end = toISODate(new Date(Date.UTC(y, m + 1, 0)));
  const label = new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-IE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, label };
}

export interface OutflowPeriod {
  key: string;
  label: string;
  start: ISODate;
  end: ISODate;
  buckets: CurrencyBucket[];
  bills: ScheduledBill[];
}

/** Projected cash outflow over the coming months, grouped per month and currency. */
export function projectedOutflow(
  commitments: Commitment[],
  today: ISODate = todayISO(),
  months = 6,
): OutflowPeriod[] {
  const periods: OutflowPeriod[] = [];
  const d = parseISODate(today);
  for (let i = 0; i < months; i++) {
    const first = toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)));
    const { start, end, label } = monthBounds(first);
    const windowStart = i === 0 ? today : start;
    const bills = scheduledBills(commitments, windowStart, end);
    periods.push({
      key: start,
      label,
      start: windowStart,
      end,
      bills,
      buckets: bucketByCurrency(bills),
    });
  }
  return periods;
}

/** Next four weeks, week by week. */
export function weeklyOutflow(commitments: Commitment[], today: ISODate = todayISO(), weeks = 4) {
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(today, i * 7);
    const end = addDays(today, i * 7 + 6);
    const bills = scheduledBills(commitments, start, end);
    return { key: start, start, end, bills, buckets: bucketByCurrency(bills) };
  });
}

export const UNPRICED_REASON_LABEL: Record<UnknownReason | "no_schedule", string> = {
  no_evidence: "Price not evidenced yet",
  variable_amount: "Amount varies each cycle",
  merchant_terms_unclear: "Merchant terms unclear",
  not_applicable: "Not applicable",
  no_schedule: "No recurring schedule recorded",
};

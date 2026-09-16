import {
  addDays,
  advance,
  daysBetween,
  occurrencesBetween,
  todayISO,
  type ISODate,
} from "./dates";
import type { Commitment, Intention } from "./types";

/** Provisional default buffers. Not contractual deadlines. */
export const REVIEW_BUFFER_DAYS = 3;
export const CANCEL_BUFFER_FROM_CUTOFF_DAYS = 2;
export const CANCEL_BUFFER_FROM_BILL_DAYS = 3;

export function earliestKnown(...dates: (ISODate | null | undefined)[]): ISODate | null {
  const list = dates.filter((d): d is ISODate => Boolean(d)).sort();
  return list[0] ?? null;
}

/**
 * Propose a planning target. Returns null when there is nothing to anchor to —
 * an unknown cutoff never becomes a confident one.
 */
export function proposeTarget(
  intention: Intention,
  opts: { cutoff?: ISODate | null; bill?: ISODate | null; trialEnd?: ISODate | null },
): { date: ISODate | null; basis: string } {
  const cutoff = opts.cutoff ?? null;
  const bill = earliestKnown(opts.trialEnd, opts.bill);

  if (intention === "keep") {
    return { date: null, basis: "Keep needs no decision target." };
  }
  if (intention === "cancel") {
    if (cutoff)
      return {
        date: addDays(cutoff, -CANCEL_BUFFER_FROM_CUTOFF_DAYS),
        basis: `${CANCEL_BUFFER_FROM_CUTOFF_DAYS} days before the merchant action cutoff`,
      };
    if (bill)
      return {
        date: addDays(bill, -CANCEL_BUFFER_FROM_BILL_DAYS),
        basis: `${CANCEL_BUFFER_FROM_BILL_DAYS} days before the next bill (cutoff unknown)`,
      };
    return { date: null, basis: "No cutoff or bill date recorded yet." };
  }
  const anchor = earliestKnown(cutoff, bill);
  if (!anchor) return { date: null, basis: "No cutoff or bill date recorded yet." };
  return {
    date: addDays(anchor, -REVIEW_BUFFER_DAYS),
    basis: cutoff
      ? `${REVIEW_BUFFER_DAYS} days before the merchant action cutoff`
      : `${REVIEW_BUFFER_DAYS} days before the earliest known date`,
  };
}

export type ActionKind = "review" | "cancel" | "trial_end" | "none";

export interface NextAction {
  kind: ActionKind;
  /** The date the person needs to act by, if any is known. */
  date: ISODate | null;
  /** "Review before" / "Cancel by" — never a bare "due date". */
  verb: string;
  basis: string;
  windowPassed: boolean;
}

export function isResolved(c: Commitment): boolean {
  return (
    c.cancellation === "confirmed" || c.lifecycle === "canceled" || c.lifecycle === "expired"
  );
}

export function nextAction(c: Commitment, today: ISODate = todayISO()): NextAction {
  if (c.intention === "keep") {
    return {
      kind: "none",
      date: null,
      verb: "Keeping",
      basis: "You decided to keep this. No decision is scheduled.",
      windowPassed: false,
    };
  }
  if (isResolved(c)) {
    return {
      kind: "none",
      date: null,
      verb: "Resolved",
      basis: "Cancellation confirmed by you.",
      windowPassed: false,
    };
  }

  const date = c.reviewTargetDate ?? c.actionCutoffDate ?? null;
  const verb = c.intention === "cancel" ? "Cancel by" : "Review before";
  const basis = c.reviewTargetDate
    ? c.actionCutoffDate
      ? "Your planning target, ahead of the merchant action cutoff"
      : "Your planning target. Cutoff unknown."
    : c.actionCutoffDate
      ? "The merchant action cutoff itself. No earlier target set."
      : "No date recorded.";

  const cutoffOrTarget = c.actionCutoffDate ?? date;
  return {
    kind: c.intention,
    date,
    verb,
    basis,
    windowPassed: Boolean(cutoffOrTarget && cutoffOrTarget < today),
  };
}

export function trialDaysLeft(c: Commitment, today: ISODate = todayISO()): number | null {
  if (c.lifecycle !== "trial" || !c.trialEndDate) return null;
  return daysBetween(today, c.trialEndDate);
}

// ---------------------------------------------------------------- Upcoming

export type BucketId = "passed" | "today" | "next7" | "later" | "needs_date";

export interface UpcomingItem {
  commitment: Commitment;
  action: NextAction;
  bucket: BucketId;
}

export const BUCKET_TITLES: Record<BucketId, string> = {
  passed: "Overdue or window passed",
  today: "Today",
  next7: "Next 7 days",
  later: "Later in the next 30 days",
  needs_date: "Needs a date",
};

export function buildUpcoming(
  commitments: Commitment[],
  today: ISODate = todayISO(),
  windowDays = 30,
) {
  const horizon = addDays(today, windowDays);
  const items: UpcomingItem[] = [];
  let beyondHorizon = 0;

  for (const c of commitments) {
    const action = nextAction(c, today);
    if (action.kind === "none") continue;
    if (!action.date) {
      items.push({ commitment: c, action, bucket: "needs_date" });
      continue;
    }
    if (action.date < today || action.windowPassed) {
      if (!c.windowAcknowledged) items.push({ commitment: c, action, bucket: "passed" });
      continue;
    }
    if (action.date === today) {
      items.push({ commitment: c, action, bucket: "today" });
      continue;
    }
    if (action.date <= addDays(today, 7)) {
      items.push({ commitment: c, action, bucket: "next7" });
      continue;
    }
    if (action.date <= horizon) {
      items.push({ commitment: c, action, bucket: "later" });
      continue;
    }
    beyondHorizon += 1;
  }

  const order: BucketId[] = ["passed", "today", "next7", "later", "needs_date"];
  const buckets = order.map((id) => ({
    id,
    title: BUCKET_TITLES[id],
    items: items
      .filter((i) => i.bucket === id)
      .sort((a, b) => (a.action.date ?? "9999").localeCompare(b.action.date ?? "9999")),
  }));

  return { buckets, beyondHorizon, horizon };
}

export function activeTrials(commitments: Commitment[], today: ISODate = todayISO()) {
  return commitments
    .filter((c) => c.lifecycle === "trial" && c.trialEndDate)
    .map((c) => ({ commitment: c, daysLeft: daysBetween(today, c.trialEndDate!) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------------------------------------------------------------- Calendar

export type CalendarEventType = "action" | "bill" | "trial_end";

export interface CalendarEvent {
  id: string;
  date: ISODate;
  type: CalendarEventType;
  commitment: Commitment;
  label: string;
  /** Screen-reader sentence. */
  description: string;
  estimated: boolean;
}

export function buildCalendarEvents(
  commitments: Commitment[],
  from: ISODate,
  to: ISODate,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const c of commitments) {
    const action = nextAction(c);

    if (action.date && action.date >= from && action.date <= to) {
      events.push({
        id: `${c.id}-action`,
        date: action.date,
        type: "action",
        commitment: c,
        label: `${action.verb} ${c.merchant}`,
        description: `Action cutoff: ${action.verb.toLowerCase()} ${c.merchant} on this day. ${action.basis}`,
        estimated: false,
      });
    }
    if (c.actionCutoffDate && c.actionCutoffDate !== action.date) {
      if (c.actionCutoffDate >= from && c.actionCutoffDate <= to && !isResolved(c)) {
        events.push({
          id: `${c.id}-cutoff`,
          date: c.actionCutoffDate,
          type: "action",
          commitment: c,
          label: `${c.merchant} merchant cutoff`,
          description: `Merchant action cutoff for ${c.merchant}. This is the last evidenced time to meet the cancellation rule.`,
          estimated: false,
        });
      }
    }
    if (c.trialEndDate && c.trialEndDate >= from && c.trialEndDate <= to) {
      events.push({
        id: `${c.id}-trial`,
        date: c.trialEndDate,
        type: "trial_end",
        commitment: c,
        label: `${c.merchant} trial ends`,
        description: `Free or promotional access to ${c.merchant} ends on this day.`,
        estimated: false,
      });
    }

    if (c.nextBillDate && !isResolved(c)) {
      const dates = c.terms.recurrence
        ? occurrencesBetween(c.nextBillDate, c.terms.recurrence, from, to)
        : c.nextBillDate >= from && c.nextBillDate <= to
          ? [c.nextBillDate]
          : [];
      for (const d of dates) {
        if (c.renewalStopDate && d > c.renewalStopDate) continue;
        events.push({
          id: `${c.id}-bill-${d}`,
          date: d,
          type: "bill",
          commitment: c,
          label: `${c.merchant} bills`,
          description: `Billing date for ${c.merchant}.${c.nextBillEstimated ? " This amount is estimated, not confirmed, and has not been paid." : ""}`,
          estimated: c.nextBillEstimated,
        });
      }
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

export function projectedBills(c: Commitment, count: number): ISODate[] {
  if (!c.nextBillDate) return [];
  const out: ISODate[] = [c.nextBillDate];
  if (!c.terms.recurrence) return out;
  for (let i = 1; i < count; i++) out.push(advance(out[i - 1], c.terms.recurrence));
  return out;
}

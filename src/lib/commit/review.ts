// Review inbox model: unconfirmed candidates, duplicate matches and term
// conflicts. Nothing here ever enters the active inventory without an explicit
// human decision, and a rejected field stays unknown rather than becoming zero.

import { addDays, todayISO } from "./dates";
import type {
  Commitment,
  Intention,
  IntervalUnit,
  OriginType,
  PurchaseChannel,
} from "./types";

export type CandidateKind = "new" | "duplicate" | "conflict";

export type FieldKind = "text" | "money" | "date" | "interval";

export type FieldDecision = "pending" | "accepted" | "edited" | "rejected";

export interface CandidateField {
  key: string;
  label: string;
  kind: FieldKind;
  /** The value as extracted from the source. */
  extracted: string | null;
  /** The value as it currently stands after any edit. */
  value: string | null;
  /** For conflicts: the value already recorded on the existing commitment. */
  currentValue?: string | null;
  excerpt: string;
  origin: OriginType;
  decision: FieldDecision;
}

export interface ReviewCandidate {
  id: string;
  kind: CandidateKind;
  merchant: string;
  planNickname: string;
  category: string;
  channel: PurchaseChannel;
  currency: string;
  /** Where the claims came from, in plain words. */
  sourceLabel: string;
  capturedAt: string;
  /** The raw-ish source text shown beside the extracted claims. */
  sourceExcerpt: string[];
  /** Existing record this candidate may belong to. */
  matchedCommitmentId?: string | undefined;
  matchReason?: string | undefined;
  fields: CandidateField[];
  status: "unreviewed" | "resolved";
  resolution?: string | undefined;
}

export function fieldValue(c: ReviewCandidate, key: string): string | null {
  const f = c.fields.find((x) => x.key === key);
  if (!f || f.decision === "rejected") return null;
  return f.value;
}

function parseMoneyMinor(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function parseInterval(value: string | null): { intervalCount: number; intervalUnit: IntervalUnit } | null {
  if (!value) return null;
  const m = /^(\d+)\s*(day|week|month|year)/i.exec(value.trim());
  if (!m) return null;
  return { intervalCount: Number(m[1]), intervalUnit: m[2]!.toLowerCase() as IntervalUnit };
}

/** Build a commitment from accepted candidate fields. Rejected fields stay unknown. */
export function candidateToCommitment(
  c: ReviewCandidate,
  intention: Intention,
  reviewTargetDate: string | null,
): Commitment {
  const today = todayISO();
  const amountMinor = parseMoneyMinor(fieldValue(c, "amount"));
  const interval = parseInterval(fieldValue(c, "interval"));
  const nextBill = fieldValue(c, "next_bill");
  const trialEnd = fieldValue(c, "trial_end");
  const cutoff = fieldValue(c, "cutoff");
  const anchor = nextBill || trialEnd || today;

  return {
    id: `${c.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
    merchant: c.merchant,
    planNickname: c.planNickname,
    category: c.category,
    channel: c.channel,
    lifecycle: trialEnd && trialEnd >= today ? "trial" : "active",
    intention,
    cancellation: "not_started",
    terms: {
      id: "v1",
      effectiveFrom: today,
      effectiveTo: null,
      amountMinor,
      amountUnknownReason: amountMinor === null ? "no_evidence" : undefined,
      currency: c.currency,
      recurrence: interval ? { ...interval, anchorDate: anchor } : null,
    },
    termHistory: [],
    nextBillDate: nextBill,
    nextBillEstimated: false,
    trialEndDate: trialEnd,
    actionCutoffDate: cutoff,
    reviewTargetDate: intention === "keep" ? null : reviewTargetDate,
    accessEndDate: null,
    renewalStopDate: null,
    noticePeriodDays: null,
    merchantTimezone: "Europe/Dublin",
    claims: c.fields
      .filter((f) => f.decision !== "rejected")
      .map((f) => ({
        field: f.key,
        label: f.label,
        value: f.value,
        origin: f.decision === "edited" ? ("manual" as OriginType) : f.origin,
        capturedAt: c.capturedAt,
        verification: f.decision === "pending" ? ("unconfirmed" as const) : ("confirmed" as const),
        excerpt: f.excerpt,
        unknownReason: f.value === null ? ("no_evidence" as const) : undefined,
      })),
    history: [
      {
        id: `h-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        kind: "created",
        summary: `Accepted from review: ${c.sourceLabel}`,
        detail: "You reviewed each extracted field before it was added.",
      },
    ],
    createdAt: new Date().toISOString(),
    sample: true,
  };
}

// ------------------------------------------------------------------ fixtures

function field(
  key: string,
  label: string,
  kind: FieldKind,
  extracted: string | null,
  excerpt: string,
  origin: OriginType,
  currentValue?: string | null,
): CandidateField {
  return {
    key,
    label,
    kind,
    extracted,
    value: extracted,
    excerpt,
    origin,
    decision: "pending",
    ...(currentValue !== undefined ? { currentValue } : {}),
  };
}

export function buildSampleCandidates(): ReviewCandidate[] {
  const today = todayISO();
  const d = (n: number) => addDays(today, n);
  const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  return [
    {
      id: "cand-orchid-suite",
      kind: "new",
      merchant: "Orchid Suite",
      planNickname: "Team plan",
      category: "Productivity",
      channel: "web",
      currency: "USD",
      sourceLabel: "Checkout confirmation page",
      capturedAt: ago(2),
      sourceExcerpt: [
        "Orchid Suite — Order confirmation",
        "Plan: Team (5 seats)",
        "You will be charged $24.00 every month starting on " + d(12) + ".",
        "Your 14-day free trial ends on " + d(12) + ".",
        "Cancel at any time from Settings → Billing. Changes take effect at the end of the current period.",
      ],
      fields: [
        field("amount", "Recurring amount", "money", "24.00", "“You will be charged $24.00 every month”", "confirmation_page"),
        field("interval", "Billing interval", "interval", "1 month", "“every month starting on …”", "confirmation_page"),
        field("next_bill", "Next bill date", "date", d(12), "“starting on " + d(12) + "”", "confirmation_page"),
        field("trial_end", "Trial end", "date", d(12), "“Your 14-day free trial ends on " + d(12) + "”", "confirmation_page"),
        field("cutoff", "Merchant action cutoff", "date", null, "No cutoff stated. “Cancel at any time … end of the current period.”", "confirmation_page"),
      ],
      status: "unreviewed",
    },
    {
      id: "cand-harbor-news-dup",
      kind: "duplicate",
      merchant: "Harbor News",
      planNickname: "Digital 4-weekly",
      category: "News",
      channel: "web",
      currency: "GBP",
      sourceLabel: "Card transaction",
      capturedAt: ago(1),
      matchedCommitmentId: "harbor-news",
      matchReason: "Same merchant name and a matching 4-week amount in GBP.",
      sourceExcerpt: [
        "Card statement line",
        "HARBOR NEWS LTD  LONDON GB",
        "£9.50 debited on " + d(-1),
        "Reference: HN-4WK-88213",
      ],
      fields: [
        field("amount", "Recurring amount", "money", "9.50", "“£9.50 debited”", "transaction", "9.50"),
        field("interval", "Billing interval", "interval", "4 week", "Inferred from the previous two debits, 28 days apart.", "transaction", "4 week"),
        field("next_bill", "Next bill date", "date", d(27), "Projected 28 days after the last debit.", "transaction", null),
      ],
      status: "unreviewed",
    },
    {
      id: "cand-northwind-conflict",
      kind: "conflict",
      merchant: "Northwind Archive",
      planNickname: "Annual archive access",
      category: "Research",
      channel: "web",
      currency: "EUR",
      sourceLabel: "Provider notice email",
      capturedAt: ago(4),
      matchedCommitmentId: "northwind-annual",
      matchReason: "The provider notice states a different price and notice period than the terms on file.",
      sourceExcerpt: [
        "Northwind Archive — Changes to your subscription",
        "From your next renewal, the annual price will be €149.00 (previously €129.00).",
        "Our cancellation notice period is changing from 30 days to 14 days before renewal.",
        "No action is needed if you are happy to continue.",
      ],
      fields: [
        field("amount", "Recurring amount", "money", "149.00", "“the annual price will be €149.00”", "provider_notice", "129.00"),
        field("notice_days", "Notice period (days)", "text", "14", "“notice period is changing from 30 days to 14 days”", "provider_notice", "30"),
      ],
      status: "unreviewed",
    },
    {
      id: "cand-tidewater",
      kind: "new",
      merchant: "Tidewater Analytics",
      planNickname: "Usage-based plan",
      category: "Data",
      channel: "web",
      currency: "EUR",
      sourceLabel: "Receipt email",
      capturedAt: ago(6),
      sourceExcerpt: [
        "Tidewater Analytics — Receipt",
        "Usage for last month: €18.40. Your amount varies with usage each month.",
        "Next invoice issues on " + d(21) + ".",
      ],
      fields: [
        field("amount", "Recurring amount", "money", null, "“Your amount varies with usage each month.” No fixed recurring amount stated.", "receipt"),
        field("interval", "Billing interval", "interval", "1 month", "“Next invoice issues …” monthly cadence.", "receipt"),
        field("next_bill", "Next bill date", "date", d(21), "“Next invoice issues on " + d(21) + "”", "receipt"),
      ],
      status: "unreviewed",
    },
  ];
}

export const CANDIDATE_KIND_LABEL: Record<CandidateKind, string> = {
  new: "Unconfirmed candidate",
  duplicate: "Possible duplicate",
  conflict: "Term conflict",
};

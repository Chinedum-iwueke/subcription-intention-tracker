// Core domain model for Commit.
// Intention, lifecycle, cancellation workflow and field verification are four
// INDEPENDENT dimensions. Changing one must never silently change another.

export type Intention = "keep" | "review" | "cancel";

export type Lifecycle = "draft" | "trial" | "active" | "paused" | "canceled" | "expired";

export type CancellationWorkflow =
  | "not_started"
  | "in_progress"
  | "awaiting_confirmation"
  | "confirmed";

export type Verification = "unconfirmed" | "confirmed" | "conflicted";

export type PurchaseChannel = "web" | "apple_app_store" | "google_play" | "unknown";

export type IntervalUnit = "day" | "week" | "month" | "year";

export type OriginType =
  | "manual"
  | "browser_checkout"
  | "confirmation_page"
  | "screenshot"
  | "receipt"
  | "email"
  | "transaction"
  | "provider_notice";

/** Reason a value is unknown. Unknown is null + reason — never zero. */
export type UnknownReason =
  | "no_evidence"
  | "variable_amount"
  | "merchant_terms_unclear"
  | "not_applicable";

export interface Recurrence {
  /** Every `intervalCount` `intervalUnit`s. */
  intervalCount: number;
  intervalUnit: IntervalUnit;
  /** ISO date (yyyy-mm-dd) the cycle is anchored to. Day-of-month is preserved. */
  anchorDate: string;
}

/** A single field's provenance. */
export interface FieldClaim {
  field: string;
  label: string;
  /** Human readable current value, or null when unknown. */
  value: string | null;
  unknownReason?: UnknownReason | undefined;
  origin: OriginType;
  capturedAt: string; // ISO datetime
  verification: Verification;
  excerpt?: string | undefined;
}

export interface TermVersion {
  id: string;
  effectiveFrom: string; // ISO date
  effectiveTo?: string | null;
  /** Integer minor units (cents). null = unknown. */
  amountMinor: number | null;
  amountUnknownReason?: UnknownReason | undefined;
  currency: string; // ISO 4217
  recurrence: Recurrence | null;
  note?: string | undefined;
}

export interface HistoryEntry {
  id: string;
  at: string; // ISO datetime
  kind:
    | "created"
    | "intention_changed"
    | "terms_revised"
    | "reminder_outcome"
    | "assistance_opened"
    | "cancellation_confirmed"
    | "window_acknowledged"
    | "manual_correction";
  summary: string;
  detail?: string | undefined;
}

export interface Commitment {
  id: string;
  merchant: string;
  /** Verified merchant domain, used for the web cancellation handoff. */
  merchantDomain?: string | undefined;
  /** Reviewed HTTPS management URL, when one is known. */
  manageUrl?: string | undefined;
  planNickname: string;
  category: string;
  channel: PurchaseChannel;

  lifecycle: Lifecycle;
  intention: Intention;
  cancellation: CancellationWorkflow;

  /** Current terms; history kept in termHistory. */
  terms: TermVersion;
  termHistory: TermVersion[];

  // --- Five separate date fields. Never collapse into a "due date". ---
  /** Next expected charge (ISO date). */
  nextBillDate: string | null;
  /** Whether the next bill amount/date is estimated rather than evidenced. */
  nextBillEstimated: boolean;
  /** End of free or promotional access. */
  trialEndDate: string | null;
  /** Last evidenced time to meet the merchant's cancellation rule. */
  actionCutoffDate: string | null;
  /** Commit's or the user's own planning date. */
  reviewTargetDate: string | null;
  /** The user explicitly acknowledged a target later than the cutoff. */
  lateTargetAcknowledged?: boolean | undefined;
  /** When service ceases, after a confirmed cancellation. */
  accessEndDate: string | null;
  /** Renewal stop date confirmed by the user. */
  renewalStopDate: string | null;
  /** Evidenced notice period in days, when known. */
  noticePeriodDays: number | null;

  /** The overdue / window-passed row was acknowledged by the user. */
  windowAcknowledged?: boolean | undefined;

  merchantTimezone: string;
  claims: FieldClaim[];
  history: HistoryEntry[];
  createdAt: string;
  /** Marks a record that came from the bundled demo set. */
  sample: boolean;
}

export const INTENTION_LABEL: Record<Intention, string> = {
  keep: "Keep",
  review: "Review",
  cancel: "Cancel",
};

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  draft: "Draft",
  trial: "Trial",
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
  expired: "Expired",
};

export const CHANNEL_LABEL: Record<PurchaseChannel, string> = {
  web: "Web purchase",
  apple_app_store: "Apple App Store",
  google_play: "Google Play",
  unknown: "Unknown channel",
};

export const WORKFLOW_LABEL: Record<CancellationWorkflow, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_confirmation: "Awaiting your confirmation",
  confirmed: "Cancellation confirmed by you",
};

export const ORIGIN_LABEL: Record<OriginType, string> = {
  manual: "Entered by you",
  browser_checkout: "Browser checkout capture",
  confirmation_page: "Confirmation page",
  screenshot: "Screenshot",
  receipt: "Receipt",
  email: "Email",
  transaction: "Card transaction",
  provider_notice: "Provider notice",
};

export const UNKNOWN_REASON_LABEL: Record<UnknownReason, string> = {
  no_evidence: "No evidence yet",
  variable_amount: "Amount varies",
  merchant_terms_unclear: "Merchant terms unclear",
  not_applicable: "Not applicable",
};

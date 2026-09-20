import type { ReviewCandidate, CandidateField } from "./review";

type FieldKey =
  "amount" | "currency" | "interval" | "trial_period" | "trial_end" | "next_bill" | "cutoff";
const keys: FieldKey[] = [
  "amount",
  "currency",
  "interval",
  "trial_period",
  "trial_end",
  "next_bill",
  "cutoff",
];
const labels: Record<FieldKey, string> = {
  amount: "Recurring amount",
  currency: "Currency",
  interval: "Billing interval",
  trial_period: "Trial period",
  trial_end: "Trial end",
  next_bill: "Next bill",
  cutoff: "Merchant action cutoff",
};
const kinds: Record<FieldKey, CandidateField["kind"]> = {
  amount: "money",
  currency: "text",
  interval: "interval",
  trial_period: "text",
  trial_end: "date",
  next_bill: "date",
  cutoff: "date",
};

export function parseExtensionCapture(
  input: unknown,
): ReviewCandidate & { captureRequestId: string } {
  if (!input || typeof input !== "object") throw new Error("Invalid capture.");
  const data = input as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max ? v.trim() : "";
  const requestId = str(data["requestId"], 64);
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || data["purchased"] !== true)
    throw new Error("Only confirmed purchases can be imported.");
  const merchant = str(data["merchant"], 80);
  const host = str(data["host"], 255);
  const intention = str(data["intention"], 12);
  if (
    !merchant ||
    !/^[a-z0-9.-]+$/i.test(host) ||
    !["keep", "review", "cancel"].includes(intention)
  )
    throw new Error("Incomplete capture.");
  const rawFields = data["fields"] as Record<string, unknown>;
  if (!rawFields || typeof rawFields !== "object") throw new Error("Missing fields.");
  const read = (key: FieldKey) => {
    const raw = rawFields[key];
    if (!raw || typeof raw !== "object") throw new Error("Missing field.");
    const part = raw as Record<string, unknown>;
    return { value: str(part["value"], 80), excerpt: str(part["excerpt"], 280) };
  };
  const amount = read("amount").value;
  const currency = read("currency").value.toUpperCase();
  if ((amount && !/^\d+(?:\.\d{1,2})?$/.test(amount)) || !/^[A-Z]{3}$/.test(currency))
    throw new Error("Invalid amount or currency.");
  const excerpts = Array.isArray(data["excerpts"])
    ? data["excerpts"]
        .filter((x): x is string => typeof x === "string" && x.length <= 280)
        .slice(0, 12)
    : [];
  const fields: CandidateField[] = keys
    .filter((key) => key !== "currency")
    .map((key) => {
      const { value, excerpt } = read(key);
      if (
        ["trial_end", "next_bill", "cutoff"].includes(key) &&
        value &&
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
      )
        throw new Error("Invalid date.");
      return {
        key,
        label: labels[key],
        kind: kinds[key],
        extracted: value || null,
        value: value || null,
        excerpt,
        origin: "browser_checkout",
        decision: "pending",
      };
    });
  return {
    id: `browser-${requestId}`,
    captureRequestId: requestId,
    intendedIntention: intention as "keep" | "review" | "cancel",
    kind: "new",
    merchant,
    planNickname: "",
    category: "Other",
    channel: "web",
    currency,
    sourceLabel: `Browser capture from ${host}`,
    capturedAt: new Date().toISOString(),
    sourceExcerpt: excerpts,
    fields,
    status: "unreviewed",
    sample: false,
  };
}

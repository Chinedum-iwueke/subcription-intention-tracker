// Contract for a configured private OCR service. Returned values are proposals,
// never confirmed terms. Keep this validator usable in the browser and Edge runtime.
export const EXTRACTABLE_FIELDS = {
  amount: { label: "Recurring amount", kind: "money" },
  interval: { label: "Billing interval", kind: "interval" },
  next_bill: { label: "Next bill date", kind: "date" },
  trial_end: { label: "Trial end", kind: "date" },
  cutoff: { label: "Merchant action cutoff", kind: "date" },
  notice_days: { label: "Notice period (days)", kind: "text" },
} as const;

export interface ParsedField {
  key: keyof typeof EXTRACTABLE_FIELDS;
  value: string | null;
  excerpt: string;
  page: number | null;
}

export interface ParsedItem {
  merchant: string;
  planNickname: string;
  nonRecurring: boolean;
  sourceExcerpt: string[];
  fields: ParsedField[];
}

const plain = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function validateExtraction(input: unknown): ParsedItem[] {
  if (!input || typeof input !== "object" || !Array.isArray((input as { items?: unknown }).items))
    throw new Error("Parser response has no items array.");
  const items = (input as { items: unknown[] }).items;
  if (items.length < 1 || items.length > 10) throw new Error("Parser must return one to ten items.");
  return items.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid parser item.");
    const item = raw as Record<string, unknown>;
    const merchant = plain(item["merchant"], 80);
    if (!merchant) throw new Error("Parser item is missing a merchant.");
    if (!Array.isArray(item["fields"]) || item["fields"].length > 30) throw new Error("Invalid parser fields.");
    const seen = new Set<string>();
    const fields = item["fields"].map((rawField): ParsedField => {
      if (!rawField || typeof rawField !== "object") throw new Error("Invalid parser field.");
      const field = rawField as Record<string, unknown>;
      const key = field["key"];
      if (typeof key !== "string" || !(key in EXTRACTABLE_FIELDS)) throw new Error("Unknown parser field.");
      if (seen.has(key)) throw new Error("Duplicate parser field.");
      seen.add(key);
      if (field["value"] !== null && (typeof field["value"] !== "string" || !field["value"].trim()))
        throw new Error("Invalid extracted value.");
      const value = field["value"] === null ? null : plain(field["value"], 120);
      const excerpt = plain(field["excerpt"], 500);
      const page = Number.isInteger(field["page"]) && Number(field["page"]) >= 1 && Number(field["page"]) <= 500
        ? Number(field["page"]) : null;
      if (value !== null && !excerpt) throw new Error("Extracted value lacks a source excerpt.");
      return { key: key as ParsedField["key"], value, excerpt, page };
    });
    return {
      merchant,
      planNickname: plain(item["planNickname"], 80) || "Plan from evidence",
      nonRecurring: item["nonRecurring"] === true,
      sourceExcerpt: Array.isArray(item["sourceExcerpt"])
        ? item["sourceExcerpt"].slice(0, 20).map((line) => plain(line, 500)).filter(Boolean)
        : [],
      fields,
    };
  });
}

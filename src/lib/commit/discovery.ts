// Bounded, deterministic V2 candidate rules. Inputs are sanitized provider facts.
// All results remain pending in the existing review inbox.
export interface BankObservation {
  externalId: string;
  accountRef: string;
  merchant: string;
  observedOn: string;
  amountMinor: number;
  currency: string;
}
export interface DiscoveryProposal {
  merchant: string;
  currency: string;
  confidence: "medium" | "high";
  sourceExcerpt: string[];
  fields: Array<{
    key: "amount" | "interval" | "next_bill" | "cutoff";
    value: string | null;
    excerpt: string;
  }>;
  groupKey: string;
}
const day = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
export function bankProposals(observations: BankObservation[]): DiscoveryProposal[] {
  const groups = new Map<string, BankObservation[]>();
  for (const item of observations) {
    if (
      !item.merchant ||
      !item.accountRef ||
      !/^[A-Z]{3}$/.test(item.currency) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.observedOn) ||
      !Number.isInteger(item.amountMinor) ||
      item.amountMinor <= 0
    )
      continue;
    const key = `${item.accountRef}\u0000${item.merchant.toLowerCase().trim()}\u0000${item.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const proposals: DiscoveryProposal[] = [];
  for (const [key, items] of groups) {
    const sorted = items.sort((a, b) => a.observedOn.localeCompare(b.observedOn));
    if (sorted.length < 3) continue;
    const latest = sorted.slice(-4);
    const gaps = latest
      .slice(1)
      .map((item, index) => day(item.observedOn) - day(latest[index]!.observedOn));
    const monthly = gaps.every((gap) => gap >= 25 && gap <= 35);
    const weekly = gaps.every((gap) => gap >= 6 && gap <= 8);
    const annual = gaps.every((gap) => gap >= 330 && gap <= 400);
    if (!monthly && !weekly && !annual) continue;
    const amounts = latest.map((item) => item.amountMinor);
    const stable =
      Math.max(...amounts) - Math.min(...amounts) <= Math.max(1, Math.round(amounts[0]! * 0.02));
    const interval = monthly ? "1 month" : weekly ? "1 week" : "1 year";
    const excerpt = `Observed ${latest.length} charges ${gaps.join(", ")} days apart in one account. This is a pattern, not a merchant term.`;
    proposals.push({
      merchant: latest.at(-1)!.merchant.slice(0, 80),
      currency: latest.at(-1)!.currency,
      confidence: stable && latest.length >= 4 ? "high" : "medium",
      groupKey: key,
      sourceExcerpt: latest.map(
        (item) =>
          `${item.observedOn}: ${item.currency} ${(item.amountMinor / 100).toFixed(2)} observed charge`,
      ),
      fields: [
        {
          key: "amount",
          value: stable ? (amounts.at(-1)! / 100).toFixed(2) : null,
          excerpt: stable
            ? `Similar amounts across ${latest.length} observed charges.`
            : "Amounts vary; fixed recurring price is unknown.",
        },
        { key: "interval", value: interval, excerpt },
        {
          key: "next_bill",
          value: null,
          excerpt: "A transaction does not establish the next contractual bill date.",
        },
        {
          key: "cutoff",
          value: null,
          excerpt: "A transaction cannot establish a cancellation cutoff.",
        },
      ],
    });
  }
  return proposals;
}

export function emailProposal(subject: string, body: string): DiscoveryProposal | null {
  if (
    /\b(?:one[- ](?:off|time)|no\s+(?:renewal|subscription|recurring))\b/i.test(
      `${subject} ${body}`,
    )
  )
    return null;
  const redact = (text: string) =>
    text
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card]");
  const lines = `${subject}\n${body}`
    .split(/\r?\n/)
    .map((line) => redact(line.trim()).slice(0, 240))
    .filter((line) =>
      /subscri|recurr|renew|trial|per month|per year|every month|every year|monthly|annual/i.test(
        line,
      ),
    )
    .slice(0, 6);
  if (
    !lines.length ||
    !/subscri|recurr|renew|per month|per year|every month|every year|monthly|annual/i.test(
      lines.join(" "),
    )
  )
    return null;
  const priceLine = lines.find(
    (line) =>
      /(?:€|£|\$)\s?\d+(?:[.,]\d{2})?/.test(line) && /per|monthly|annual|renew|recurr/i.test(line),
  );
  const price = priceLine?.match(/(€|£|\$)\s?(\d+(?:[.,]\d{2})?)/);
  const currency = price
    ? ({ "€": "EUR", "£": "GBP", $: "USD" } as Record<string, string>)[price[1]!]!
    : "";
  if (!currency) return null;
  const intervalLine = lines.find((line) => /every|per month|per year|monthly|annual/i.test(line));
  const interval = /month/i.test(intervalLine ?? "")
    ? "1 month"
    : /year|annual/i.test(intervalLine ?? "")
      ? "1 year"
      : null;
  const merchant =
    redact(subject)
      .split(/[|–—:]/)[0]!
      .replace(/^(receipt|invoice|renewal)\s+(?:for|from)\s+/i, "")
      .trim()
      .slice(0, 80) || "Unknown sender";
  return {
    merchant,
    currency,
    confidence: "medium",
    groupKey: "",
    sourceExcerpt: lines,
    fields: [
      {
        key: "amount",
        value: price ? price[2]!.replace(",", ".") : null,
        excerpt: priceLine ?? "No fixed recurring price found.",
      },
      { key: "interval", value: interval, excerpt: intervalLine ?? "No billing interval found." },
      { key: "next_bill", value: null, excerpt: "No verified next bill date extracted." },
      { key: "cutoff", value: null, excerpt: "No verified cancellation cutoff extracted." },
    ],
  };
}

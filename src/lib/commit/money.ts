import type { Commitment, TermVersion } from "./types";

export function formatMoney(amountMinor: number | null, currency: string): string {
  if (amountMinor === null) return "Unknown";
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

/** 364-day reference year: a 4-week cycle has 13 occurrences, not 12. */
const REFERENCE_YEAR_DAYS = 364;

export function annualEquivalentMinor(term: TermVersion): number | null {
  if (term.amountMinor === null || !term.recurrence) return null;
  const { intervalCount, intervalUnit } = term.recurrence;
  const n = Math.max(1, intervalCount);
  switch (intervalUnit) {
    case "day":
      return Math.round((term.amountMinor * REFERENCE_YEAR_DAYS) / n);
    case "week":
      return Math.round((term.amountMinor * (REFERENCE_YEAR_DAYS / 7)) / n);
    case "month":
      return Math.round((term.amountMinor * 12) / n);
    case "year":
      return Math.round(term.amountMinor / n);
  }
}

export function monthlyEquivalentMinor(term: TermVersion): number | null {
  const annual = annualEquivalentMinor(term);
  return annual === null ? null : Math.round(annual / 12);
}

export interface CurrencyTotal {
  currency: string;
  monthlyMinor: number;
  annualMinor: number;
  counted: number;
}

/**
 * Group by original currency. EUR and USD are never added together.
 * Records with unknown amounts are excluded and reported separately.
 */
export function coverageSummary(commitments: Commitment[]) {
  const byCurrency = new Map<string, CurrencyTotal>();
  let unknownAmounts = 0;

  for (const c of commitments) {
    if (c.lifecycle === "canceled" || c.lifecycle === "expired") continue;
    const monthly = monthlyEquivalentMinor(c.terms);
    if (monthly === null) {
      unknownAmounts += 1;
      continue;
    }
    const entry = byCurrency.get(c.terms.currency) ?? {
      currency: c.terms.currency,
      monthlyMinor: 0,
      annualMinor: 0,
      counted: 0,
    };
    entry.monthlyMinor += monthly;
    entry.annualMinor += annualEquivalentMinor(c.terms) ?? 0;
    entry.counted += 1;
    byCurrency.set(c.terms.currency, entry);
  }

  return {
    totals: [...byCurrency.values()].sort((a, b) => b.monthlyMinor - a.monthlyMinor),
    unknownAmounts,
    tracked: commitments.filter((c) => c.lifecycle !== "canceled" && c.lifecycle !== "expired")
      .length,
  };
}

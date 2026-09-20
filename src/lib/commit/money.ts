import type { TermVersion } from "./types";

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

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Load the pure domain modules without adding a test runner dependency.
const root = new URL("../src/lib/commit/", import.meta.url);
const temp = await mkdtemp(join(tmpdir(), "commit-phase2-"));
const modules = ["dates", "derive", "fixtures", "money", "review", "spending"];

try {
  for (const name of modules) {
    const source = await readFile(new URL(`${name}.ts`, root), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: `${name}.ts`,
    }).outputText.replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"');
    await writeFile(join(temp, `${name}.mjs`), compiled);
  }

  const load = (name) => import(pathToFileURL(join(temp, `${name}.mjs`)).href);
  const dates = await load("dates");
  const derive = await load("derive");
  const review = await load("review");
  const spending = await load("spending");
  const fixtures = await load("fixtures");

  assert.deepEqual(
    dates.occurrencesBetween("2025-01-31", { intervalCount: 1, intervalUnit: "month", anchorDate: "2025-01-31" }, "2025-01-01", "2025-03-31"),
    ["2025-01-31", "2025-02-28", "2025-03-31"],
  );
  assert.equal(dates.advance("2024-02-29", { intervalCount: 1, intervalUnit: "year", anchorDate: "2024-02-29" }), "2025-02-28");
  assert.equal(derive.proposeTarget("cancel", { cutoff: "2026-11-01" }, { reviewBufferDays: 3, cancelBufferCutoffDays: 5, cancelBufferBillDays: 3 }).date, "2026-10-27");

  const candidates = review.buildSampleCandidates();
  assert.equal(candidates.filter((c) => c.sourceLabel === "Two-plan invoice simulation").length, 2);
  assert.equal(candidates.find((c) => c.nonRecurring)?.id, "cand-one-off-receipt");
  const candidate = candidates[0];
  assert.equal(review.fieldValue(candidate, "amount"), null, "pending extraction cannot affect totals");
  assert.equal(review.pendingFields(candidate).length, candidate.fields.length);
  candidate.fields[0].decision = "edited";
  candidate.fields[0].value = "25.00";
  assert.equal(review.fieldValue(candidate, "amount"), "25.00");
  const commitment = review.candidateToCommitment(candidate, "keep", null);
  assert.equal(commitment.terms.amountMinor, 2500);
  assert.equal(commitment.nextBillDate, null, "pending date cannot become a scheduled bill");
  assert.equal(commitment.claims.find((c) => c.label.includes("original extraction"))?.verification, "unconfirmed");
  assert.equal(review.fieldError({ ...candidate.fields[0], value: "-2" }) !== null, true);

  const records = fixtures.buildSampleCommitments();
  const coverage = spending.buildCoverage(records);
  assert.equal(coverage.inScope, records.filter((c) => c.lifecycle === "active" || c.lifecycle === "trial").filter((c) => !derive.isResolved(c)).length);
  assert.equal(coverage.groups.length, new Set(coverage.groups.map((g) => g.currency)).size);
  assert.equal(spending.scheduledBills(records, dates.todayISO(), dates.addDays(dates.todayISO(), 30)).some((b) => b.commitment.lifecycle === "paused"), false);

  const base = records.find((c) => c.id === "northwind-annual");
  assert.ok(base);
  const effectiveFrom = dates.addDays(dates.todayISO(), 20);
  const revised = {
    ...base,
    terms: { ...base.terms, amountMinor: 20000, effectiveFrom },
    termHistory: [{ ...base.terms, effectiveTo: dates.addDays(effectiveFrom, -1) }, ...base.termHistory],
  };
  assert.equal(spending.termAt(revised, dates.todayISO()).amountMinor, base.terms.amountMinor);
  assert.equal(spending.termAt(revised, effectiveFrom).amountMinor, 20000);

  console.log("Phase 2 domain checks passed: recurrence, buffers, claim review, coverage, paused bills, term effective dates.");
} finally {
  await rm(temp, { recursive: true, force: true });
}

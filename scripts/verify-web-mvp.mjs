import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const temp = await mkdtemp(join(tmpdir(), "commit-mvp-"));
try {
  const source = await readFile(new URL("../src/lib/commit/parser.ts", import.meta.url), "utf8");
  await writeFile(join(temp, "parser.mjs"), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText);
  const { validateExtraction } = await import(pathToFileURL(join(temp, "parser.mjs")).href);
  const valid = { items: [
    { merchant: "Atlas", planNickname: "Pro", nonRecurring: false,
      sourceExcerpt: ["Atlas Pro: EUR 12 monthly"],
      fields: [{ key: "amount", value: "12.00", excerpt: "EUR 12 monthly", page: 1 }] },
    { merchant: "Second plan", nonRecurring: true, fields: [] },
  ] };
  const parsed = validateExtraction(valid);
  assert.equal(parsed.length, 2, "multi-plan evidence stays split");
  assert.equal(parsed[0].fields[0].page, 1);
  assert.equal(parsed[1].nonRecurring, true, "one-off item must remain flagged");
  assert.throws(() => validateExtraction({ items: [] }), /one to ten/);
  assert.throws(() => validateExtraction({ items: Array(11).fill(valid.items[0]) }), /one to ten/);
  assert.throws(() => validateExtraction({ items: [{ merchant: "Atlas", fields: [{ key: "amount", value: "12", excerpt: "" }] }] }), /source excerpt/);
  assert.throws(() => validateExtraction({ items: [{ merchant: "Atlas", fields: [{ key: "password", value: "secret", excerpt: "Password" }] }] }), /Unknown parser field/);
  assert.throws(() => validateExtraction({ items: [{ merchant: "Atlas", fields: [{ key: "amount", value: "12", excerpt: "12" }, { key: "amount", value: "13", excerpt: "13" }] }] }), /Duplicate parser field/);
  assert.throws(() => validateExtraction({ items: [{ merchant: "Atlas", fields: [{ key: "amount", value: "", excerpt: "12" }] }] }), /Invalid extracted value/);
  assert.equal(validateExtraction({ items: [{ merchant: "A".repeat(200), fields: [] }] })[0].merchant.length, 80);
  for (const name of ["parse-evidence", "dispatch-reminders", "reminder-webhook", "purge-evidence", "calendar-feed", "dispatch-push"]) {
    const path = new URL(`../supabase/functions/${name}/index.ts`, import.meta.url);
    const edgeSource = await readFile(path, "utf8");
    const parsedEdge = ts.createSourceFile(`${name}.ts`, edgeSource, ts.ScriptTarget.ES2022, true);
    assert.equal(parsedEdge.parseDiagnostics.length, 0, `${name} Edge function must parse as TypeScript`);
  }
  console.log("Web MVP parser contract and Edge syntax checks passed.");
} finally {
  await rm(temp, { recursive: true, force: true });
}

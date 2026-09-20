import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'commit-discovery-'));
try {
  const source = await readFile(new URL('../src/lib/commit/discovery.ts', import.meta.url), 'utf8');
  await writeFile(join(temp, 'discovery.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
  const { bankProposals, emailProposal } = await import(pathToFileURL(join(temp, 'discovery.mjs')).href);
  const bank = (dates, amounts, merchant = 'Harbor News') => dates.map((observedOn, index) => ({ externalId: `tx-${index}`, accountRef: 'account-A', merchant,
    observedOn, amountMinor: amounts[index], currency: 'GBP' }));
  const monthly = bank(['2026-06-01','2026-07-01','2026-08-01','2026-09-01'], [950,950,950,950]);
  const stable = bankProposals(monthly);
  assert.equal(stable.length, 1);
  assert.equal(stable[0].confidence, 'high');
  assert.equal(stable[0].fields.find((field) => field.key === 'interval').value, '1 month');
  assert.equal(stable[0].fields.find((field) => field.key === 'cutoff').value, null);
  assert.equal(stable[0].fields.find((field) => field.key === 'next_bill').value, null);
  const variable = bankProposals(bank(['2026-06-01','2026-07-01','2026-08-01'], [1000,1500,900]));
  assert.equal(variable[0].fields.find((field) => field.key === 'amount').value, null);
  assert.equal(bankProposals(bank(['2026-06-01','2026-06-04','2026-08-01'], [1000,1000,1000])).length, 0);
  assert.equal(bankProposals(monthly.slice(0,2)).length, 0);
  const email = emailProposal('Orchid Suite renewal', 'Your subscription renews at €12.00 per month. Contact alice@example.com.');
  assert.equal(email.currency, 'EUR');
  assert.equal(email.fields.find((field) => field.key === 'cutoff').value, null);
  assert.ok(!email.sourceExcerpt.join(' ').includes('alice@example.com'));
  assert.equal(emailProposal('One-off receipt', 'Paid £20 once, no renewal.'), null);
  for (const name of ['discovery-source', 'gmail-discovery-callback', 'sync-discovery']) {
    const text = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8');
    const parsed = ts.createSourceFile(`${name}.ts`, text, ts.ScriptTarget.ES2022, true);
    assert.equal(parsed.parseDiagnostics.length, 0, `${name} must parse as TypeScript`);
  }
  const migration = await readFile(new URL('../supabase/migrations/202609200006_discovery.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes('revoke all on public.commit_discovery_connections from public, anon, authenticated'));
  console.log('V2 discovery fixtures and Edge syntax checks passed.');
} finally { await rm(temp, { recursive: true, force: true }); }

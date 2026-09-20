import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseCapture } from '../extension/parser.js';

const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, []);
assert.deepEqual(manifest.optional_host_permissions.sort(), ['https://*.paddle.com/*', 'https://checkout.stripe.com/*'].sort());
assert.ok(!JSON.stringify(manifest).includes('cookies'));

const positive = [
  ['$12.00 per month subscription', 'USD', '12.00', '1 month'],
  ['€9.99 every month, renews automatically', 'EUR', '9.99', '1 month'],
  ['£44.00 per year subscription', 'GBP', '44.00', '1 year'],
  ['$7 per week recurring', 'USD', '7', '1 week'],
  ['€100 annually renewable', 'EUR', '100', '1 year'],
  ['$3.50 monthly billing', 'USD', '3.50', '1 month'],
  ['£14.99 every 2 weeks subscription', 'GBP', '14.99', '2 week'],
  ['$24.00 every 3 months recurring', 'USD', '24.00', '3 month'],
  ['€18 per month renewal', 'EUR', '18', '1 month'],
  ['$240.00 annual subscription', 'USD', '240.00', '1 year'],
  ['£2.00 monthly subscription', 'GBP', '2.00', '1 month'],
  ['€49.99 per year renews', 'EUR', '49.99', '1 year'],
  ['$11.00 every month membership', 'USD', '11.00', '1 month'],
  ['€6.00 recurring per month', 'EUR', '6.00', '1 month'],
  ['£19.00 per month subscription', 'GBP', '19.00', '1 month'],
  ['$8.00 per month recurring', 'USD', '8.00', '1 month'],
  ['€70.00 yearly subscription', 'EUR', '', ''],
  ['$5 monthly recurring', 'USD', '5', '1 month'],
  ['£25 annually subscription', 'GBP', '25', '1 year'],
  ['$99.00 per year recurring', 'USD', '99.00', '1 year'],
];
let truePositive = 0, falsePositive = 0, falseNegative = 0;
for (const [line, currency, amount, interval] of positive) {
  const result = parseCapture({ title: 'Example Checkout', host: 'checkout.stripe.com', supported: 'Stripe Checkout', excerpts: [line] });
  if (result.recurring) truePositive++; else falseNegative++;
  if (amount) {
    assert.equal(result.fields.amount.value, amount);
    assert.equal(result.fields.currency.value, currency);
    assert.equal(result.fields.interval.value, interval);
  }
}
for (const line of ['One-time purchase $24.00', 'Pay £8.00 today', 'Free trial sample, no subscription', 'Card ending 4242', 'Invoice €20.00, no renewal']) {
  if (parseCapture({ title: 'Checkout', host: 'checkout.stripe.com', excerpts: [line] }).recurring) falsePositive++;
}
const dated = parseCapture({ title: 'Example', host: 'checkout.stripe.com', excerpts: [
  '14-day free trial ends on September 27, 2026.',
  'Next bill on 2026-09-28: €12.00 every month.',
  'Cancel before 26 September 2026.'
] });
assert.equal(dated.fields.trial_period.value, '14 day');
assert.equal(dated.fields.trial_end.value, '2026-09-27');
assert.equal(dated.fields.next_bill.value, '2026-09-28');
assert.equal(dated.fields.cutoff.value, '2026-09-26');
const precision = truePositive / (truePositive + falsePositive);
const recall = truePositive / (truePositive + falseNegative);
assert.ok(precision >= 0.95, `Precision ${precision}`);
assert.ok(recall >= 0.95, `Recall ${recall}`);
for (const file of ['extension/extract.js', 'extension/detector.js']) {
  const code = readFileSync(file, 'utf8');
  assert.ok(code.includes('input') && code.includes('iframe'), `${file} must exclude sensitive nodes`);
}
const extracted = vm.runInNewContext(readFileSync('extension/extract.js', 'utf8'), {
  location: { hostname: 'checkout.stripe.com' },
  document: {
    title: 'Example Checkout',
    querySelector: () => ({ cloneNode: () => ({
      textContent: 'Example plan\n$12.00 every month\nTrial ends on 2026-10-04\nCancel before 2026-10-03',
      querySelectorAll: () => [],
    }) }),
  },
});
assert.equal(extracted.supported, 'Stripe Checkout');
assert.equal(extracted.excerpts.length, 3);
console.log(`Extension fixtures: ${positive.length + 5}; precision ${(precision * 100).toFixed(1)}%; recall ${(recall * 100).toFixed(1)}%`);

# V1 verification record

## Repository checks run on 20 September 2026

| Check | Result | Limit |
| --- | --- | --- |
| TypeScript `npx tsc --noEmit` | Pass | Web project only; Edge functions receive syntax validation |
| Production `npm run build` | Pass | No hosted runtime |
| `npm run verify:phase2` | Pass | Domain fixtures |
| `npm run verify:web-mvp` | Pass | Parser contracts and Edge syntax |
| `npm run verify:extension` | Pass, 25 labeled synthetic cases; 100% precision and recall on this set | Small local fixture set; no live merchant claim |
| Local browser `/capture/import` | Pass: invalid input fails; confirmed synthetic candidate shows cloud requirement and fragment is removed | Browser package itself was not installed |
| Local browser `/settings` | Pass: calendar/push remain clearly unavailable in demo mode | No Supabase/VAPID device test |

## Staging and installed-browser checks

These require a configured staging Supabase project and an installed Chromium extension. Record browser version, extension ID/version, device/OS, test account IDs, timestamp, exact fixture URL or redacted evidence, expected result, actual result, and owner for each case.

1. Load `extension/` unpacked. Verify the popup opens and only `activeTab`, `scripting`, and `storage` are initially granted. On a page with subscription terms, click Capture and compare every excerpt to visible text. Verify password, card, email, form, and frame contents are absent.
2. Test unsupported page, denied optional permission, granted Stripe/Paddle permission, indicator behavior, Chrome-level revocation, and popup reopen. Permissioned detection must send only a badge signal; it must not create a draft before Capture.
3. Leave checkout unfinished. Reopen popup within 24 hours; confirm draft persists but creates no candidate, commitment, bill, or job. Advance test clock past 24 hours and verify deletion. Save an updated draft and verify the original expiry is unchanged.
4. Confirm purchase and open import. Check sign-in return, fragmented payload removal, candidate validation, pending field decisions, and eventual accepted commitment. Disconnect network before import and confirm retry preserves the extension draft. Retry one request ID twice and verify one candidate.
5. Choose an existing merchant record when importing changed terms. Confirm review shows current and proposed values; schedule and spending remain unchanged until acceptance. Use ambiguous variable charges and different plans/accounts to verify duplicate versus conflict decisions are made by a person.
6. Label a separate current-site fixture set for Stripe and Paddle plus unsupported sites, dynamic checkout, trial, tax, discount, cross-origin frame, and non-English copy. Compute precision and recall independently. Release requires at least 95% precision on supported-site fixtures; report denominator and false positives.
7. Deploy calendar migration/function. Create, rotate and revoke a feed. Repeat fetch and verify stable UIDs, no draft events, edit/deletion propagation, 404 after revocation, owner separation, no token logs, and cache behavior in at least two calendar clients.
8. Deploy push migration/worker with VAPID. Test opt-in on each supported device, permission denial, revocation on one device versus all, stale version and draft suppression, quiet hours, privacy mode, offline device, provider expiry, and job status. Do not enable delivery without a monitored scheduled worker. A browser/OS may delay or block receipt; record observed outcomes.

Release ownership and evidence belong in Stage G of the roadmap. No live Supabase project, VAPID keys, or installed-extension browser connection were available for this repository run.

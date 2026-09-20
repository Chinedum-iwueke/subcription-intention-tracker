# Web MVP verification record

Keep this record with the tested commit and environment before any real-user pilot. Local code checks show only that the repository builds and pure contracts behave as expected. Live owner isolation, OCR processing, delivery, accessibility, retention, and recovery require a configured staging deployment.

## Local gate

| Check | Command or method | Required result |
| --- | --- | --- |
| Type and route generation | `npx tsc --noEmit` after `npm run build` | Zero errors |
| Production package | `npm run build` | Client and server build succeed |
| Domain rules | `npm run verify:phase2` | Recurrence, dates, review, coverage pass |
| OCR response contract | `npm run verify:web-mvp` | Bounded multi-item results; unknown fields and excerpt-free claims rejected |
| Demo browser | Open `/onboarding`, `/add`, `/review`, `/spending`, `/settings`, detail, and `/demo/checkout` | No runtime errors or false claims of live integrations |

## Staging gate

Set up an isolated project and apply migrations in order. Run `npm run verify:staging` with two disposable user JWTs and the documented staging variables. Preserve the command output and project migration version. Reset the disposable records afterward.

Required variables: `STAGING_SUPABASE_URL`, `STAGING_PUBLISHABLE_KEY`,
`STAGING_USER_A_JWT`, `STAGING_USER_B_JWT`, and
`STAGING_ALLOW_DISPOSABLE_WRITES=yes`. Use short-lived tokens for two accounts in
the isolated project. The script refuses to run without the explicit staging-write flag.

| Flow | Reproduction | Required result |
| --- | --- | --- |
| Account | Create two users; test confirm, sign in, deep link, sign out, expiry and another device | Only the correct account data appears; return path stays inside the app |
| Manual entry | Save merchant with unknown price and date; then add an exact date and currency | Unknowns remain unknown; schedule appears only after a verified anchor; data survives refresh/device |
| Private evidence | Upload PNG, JPEG and PDF; try wrong MIME/oversize and another user's object path | Allowed files stay owner scoped; rejected files create no candidate; other user gets no bytes |
| Retention | Choose 30 and 90 days; accelerate due dates in staging; run purge twice and simulate Storage failure | Bytes disappear at expiry, paths are removed from candidates, retries are safe, reviewed terms remain, and failed deletion is visible to operators |
| Extraction | Decline per-file processor consent, then opt in on a separate file; run one-item, multi-item, one-off, ambiguous, timeout, malformed response, retry, and stop cases | No bytes go to OCR without matching consent; every value remains pending with excerpt/page; multi-item split is atomic; failure keeps manual path |
| Review update | In two sessions accept, edit and reject claims; update an existing commitment concurrently | Candidate and commitment change together or neither changes; stale version fails visibly; prior terms and source remain inspectable |
| Cancellation | Open provider link, confirm with basis and separate dates, then correct an erroneous confirmation | Handoff never closes renewal; correction restores future action without erasing history |
| Outbox | Opt in after preview, edit target, revoke consent, pause/cancel, snooze, run workers twice | Old jobs suppress; at most one logical email per job; snooze stays within action window; no past-date burst |
| Delivery | Send provider test email, replay signed webhook, send bad signature, simulate bounce/delay | Provider acceptance and actual delivery differ; bad signatures fail; replay is idempotent; failures visible |
| Data controls | Export, delete account with evidence, restore backup into isolated staging | Complete owner-only export; bytes and rows removed; restore meets agreed targets |

## Accessibility and pilot gate

- Test the named routes by keyboard, screen reader, mobile viewport and 200% zoom. Include errors, empty account, loading, offline, upload and auth return flows. Record issue severity and retest fixes.
- Measure p95 mobile route load and scheduled dispatch delay with a fixed fixture set, device/network profile, cohort and sample size. Record actual measurements, not targets alone.
- Run the PRD's task protocol with neutral prompts, particularly action date versus bill date, Apple screenshot capture, duplicate review, cancellation handoff, and late reminder. Log participant count, failures and corrections.
- Record owner, date, environment, test evidence, remaining limitations and go/no-go decision. A passing local build is insufficient for pilot authorization.

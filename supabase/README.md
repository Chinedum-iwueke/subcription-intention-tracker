# Commit web foundation

The browser demo works without credentials and stores synthetic records in localStorage. A live account uses a separate empty dataset and Supabase Auth, Postgres and private Storage. Demo records are never migrated into an account automatically.

## Configure a project

1. Create a Supabase project in the region chosen for the product. Record its project URL and publishable key. Never put a service-role key in a `VITE_` variable.
2. Apply all six migrations in order in a staging project first, then in production. Review them before use; they have not been applied or exercised against a live project in this repository.
3. Copy `.env.example` to `.env.local` and set both values. Configure the Auth site URL and allowed redirect URLs for each deployed domain.
4. Set email confirmation and abuse controls in the Supabase dashboard. Configure SMTP before inviting real users.
5. Run `npm run build`, then test account creation, sign in, direct links, sign out, record creation, updates, export and deletion with two independent users.

## Optional email deployment

The second migration creates a consent-gated reminder outbox; the third adds bounded snooze and delivery states. Deploy `functions/dispatch-reminders` with private secrets `WORKER_TOKEN`, `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Verify the sender domain with Resend. Use Supabase Cron to POST to the function periodically with the worker token stored in Vault. Deploy `functions/reminder-webhook` with `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Register its URL for delivery, delay, bounce, complaint, and failed events. The worker token and service-role key must never be placed in `VITE_` variables or client code. Run two-worker, revoked-consent, edited-date, retry, quiet-hour, snooze, webhook replay, and expired-window staging checks before setting both private `EMAIL_DELIVERY_ENABLED=true` and public `VITE_COMMIT_EMAIL_AVAILABLE=true`. Both flags default off.

The outbox distinguishes provider acceptance from later delivery outcomes. It schedules at most one email for each current action target and record version, avoiding escalation bursts. Users may snooze a queued job once or again within seven days and no later than its action date. Provider acceptance does not guarantee inbox placement.

## Optional V1 calendar and push

Migration four adds an owner-scoped, revocable calendar feed token. Deploy `functions/calendar-feed` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The public URL is a bearer credential: never log it or put it in analytics. Settings creates a random token, stores only its hash through an authenticated RPC, shows the URL once, and can rotate or revoke it. The feed contains only known decision targets, merchant cutoffs, and the next projected bill. It reads current records on every request, so stable event IDs update when records change; external calendar clients can refresh late or keep cached copies after revocation. Test owner isolation, repeated fetch, edit/deletion, rotate, revocation, and cache headers in staging.

Migration five adds per-device push subscriptions and a versioned outbox. Generate VAPID keys privately. Set only `VITE_COMMIT_VAPID_PUBLIC_KEY` in the web build; keep `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WORKER_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Edge secrets. Deploy `functions/dispatch-push`, then schedule it with a private token in Supabase Cron. Keep `PUSH_DELIVERY_ENABLED` off until current-version, revoked-consent, browser denial, two-device, quiet-hour, offline, and provider failure checks pass. Browser/OS delivery is not guaranteed. The worker treats ambiguous provider errors as failures that operators must inspect; it must not promise exactly-once push reception. The service worker caches only a static offline explanation, never account data.

## Private OCR adapter

`functions/parse-evidence` accepts a signed-in candidate ID and retrieves only that user's private file. It calls `OCR_ENDPOINT` with the original file bytes, an `Authorization: Bearer OCR_TOKEN` header, the file MIME type, and an `X-Commit-Origin` header. The endpoint must return JSON with an `items` array of one to ten proposed subscriptions. Each item contains a merchant, optional plan nickname, `nonRecurring` flag, optional source excerpts, and up to 30 fields. Fields use only `amount`, `interval`, `next_bill`, `trial_end`, `cutoff`, or `notice_days`; a non-null value must include a matching source excerpt and optional one-based page number. See `src/lib/commit/parser.ts` for the precise bounded validator. These proposals stay pending until the user decides field by field. Failed or timed-out extraction leaves the private file available for manual review; a user can retry or stop an active run.

Select and review the OCR processor, hosting region, data handling agreement, retention, and cost before setting `OCR_ENDPOINT`, `OCR_TOKEN`, private `OCR_PROCESSOR_NAME`/`OCR_PROCESSOR_REGION`, private `OCR_PROCESSING_ENABLED=true`, and matching public `VITE_COMMIT_OCR_PROCESSOR_NAME`/`VITE_COMMIT_OCR_PROCESSOR_REGION` plus `VITE_COMMIT_OCR_AVAILABLE=true`. Do not enable the adapter merely because an endpoint responds. The user must explicitly opt in per upload; the function checks that the candidate's stored consent matches its configured processor and region. The original evidence includes potentially sensitive financial and personal details, so the UI requests redaction before upload. The file is never sent to a processor while server-side OCR remains disabled.

## Evidence retention

At upload, the user chooses 30 or 90 days for original file bytes. The registration command stores `retain_until`. Deploy `functions/purge-evidence` with `RETENTION_WORKER_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, then schedule it through Supabase Cron with its token held in Vault. The worker removes private bytes before marking evidence expired and removing file paths from review candidates. Reviewed terms, source excerpts and history remain until account deletion; this distinction must be stated in the final privacy notice. Run accelerated retention tests in staging and verify both bytes and metadata state. Do not accept real uploads until the cleanup schedule, failure alert, and backup expiry policy are operational.

## V2 discovery deployment

Migration six creates service-role-only connection, OAuth state and observation tables plus an authenticated metadata RPC. Deploy `discovery-source` and `gmail-discovery-callback`; configure `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random 32-byte hex `DISCOVERY_TOKEN_KEY` as private secrets. For Gmail, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; register the exact Supabase callback URL in Google Cloud. For bank access, add `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, approved `PLAID_COUNTRY_CODES`, and `PLAID_REDIRECT_URI` (the HTTPS `/discovery` URL, registered in Plaid). Deploy and privately schedule `sync-discovery` with `DISCOVERY_WORKER_TOKEN`. Start with all source flags off. See `docs/v2-discovery-verification.md` for gates and privacy tests.

The app requests only Gmail read access or Plaid Transactions access. Provider credentials remain encrypted server-side. Disconnection immediately stops ingestion and attempts provider revocation; a failed revoke is visible for retry. Account deletion refuses active source connections. Review findings can be removed separately after disconnect, while confirmed commitments remain until account deletion.

## Security and operations gates

- Use two test users to probe direct PostgREST reads by guessed IDs and writes through each RPC. Verify both table rows and `commit-evidence` Storage objects remain owner scoped.
- `npm run verify:staging` automates disposable owner A/B row, RPC, and Storage probes. It requires an isolated project, two user JWTs, and `STAGING_ALLOW_DISPOSABLE_WRITES=yes`; it deliberately does not run in CI without those values. Reset the staging project afterward.
- Make a concurrent edit from two browser sessions and confirm the second version checked write fails visibly. Export the unsaved local draft before reloading.
- Enable encrypted project backups and point-in-time recovery according to the selected Supabase plan. Restore into staging and verify counts, auth, policies and private objects before storing real evidence.
- Approve the 30/90-day original-file choices and backup expiry statement. Private uploads, manual review, bounded OCR adapter, multi-item splitting and retention worker are in the repository but need configured services and staging evidence.
- Delete a staging account and verify its rows disappear. If it has stored evidence, remove those objects through the Storage API first; the account deletion RPC refuses deletion while objects remain.

The current web integration uses authenticated, owner derived RPC calls. Local changes are kept in memory when a save fails, with an export action. Conflict comparison and retry should be verified against a configured project before real data is accepted.

# Commit product roadmap and implementation backlog

Status: working plan, updated 20 September 2026. Authorization comes from the user's requests,
not from this document. Phase 2 and B repository work has begun; deployment verification remains open.

This plan continues the existing Lovable project. The Phase 1 foundation and parts of Phase 2
already exist. The product requirements document (PRD) is
`/Users/ice/Downloads/Commit_Product_Requirements_Document.docx`; its functional requirement
IDs (FR) and nonfunctional requirement IDs (NFR) below are traceability references. The
checked-in Phase 1 plan remains the baseline for the current UI and behavior.

## Product and engineering constraints

- Preserve the current TanStack Start, React, Tailwind, shadcn/Radix, and Lovable Vite setup.
- Preserve `src/styles.css` tokens, typography, navigation, `AppShell`, `Panel`, badges, event
  markers, and the action-first language. Extend existing components before adding new ones.
- Keep intention, lifecycle, cancellation workflow, and field verification independent.
  Never present an intention to cancel as completed cancellation.
- Keep contractual cutoff, planning target, trial end, bill date, renewal stop, and access end
  distinct. Unknown values remain unknown; original currencies are never directly summed.
- Label simulations and sample records. A screen or preview is not evidence that an external
  integration, reminder, or financial action has happened.
- Use one backend path for live data. Do not add major dependencies until a specific task
  requires them. Keep the GitHub-connected branch in a working state; do not rewrite pushed
  history.

## Current baseline

Phase 1 provides Upcoming, Calendar, inventory, detail, manual entry, cancellation guidance,
and settings. Phase 2 added `/demo/checkout`, `/spending`, and `/review`. The repository now
also contains a Supabase account integration, a migration, and a private evidence bucket
definition. The demo remains browser-local; the live path has not been connected to a project
or verified with real credentials. Receipt/screenshot review remains a local prototype without
OCR or durable file upload. There is no real extension, outbound reminder worker, or email/bank
connection. React Query is installed but is not the product data source.

## Release sequence and gates

| Stage | Deliverable | Exit gate |
| --- | --- | --- |
| A. Complete Phase 2 | Reliable synthetic capture, spending, and review prototype | All core flows work with fixtures; no pending claim silently becomes trusted data |
| B. Web MVP foundation | Private accounts, durable records, evidence, and versioned commands | Cross-user UI, API, and evidence-access probes fail; export/deletion and restore work |
| C. Web MVP loop | Real manual/upload capture, candidate review, decisions, and optional email reminders | PRD MVP P0 contracts, accessibility, scheduling, and usability gates pass |
| D. V1 extension | Separately packaged Chromium capture and term proposals | Permission, purchase-state, supported-site, and fallback tests pass |
| E. V1 optional channels | Installed-PWA push and calendar export | Device behavior, revocation, and feed-update tests pass |
| F. V2 discovery | Consented mailbox and read-only transaction candidates | Partner, consent, security, region, and cost gates pass |
| G. Deployment depth | Configure and prove the selected release in staging, then production | Recorded security, recovery, operations, and release evidence passes |

Dependencies flow from A to B to C to D. E depends on C and can follow D. F depends on C;
neither extension nor V2 work is a prerequisite for a safe web MVP pilot. Stage G is performed
last for each release scope (web MVP, V1, or V2). Its real-data security gates must pass before
that release accepts users or uploads; deferring G means retaining demo/staging-only use.

## A. Complete Phase 2: capture simulation, spending, evidence review

### A1. Make claim review authoritative — P0

- [ ] Require an explicit accept, correction, or unknown decision for each critical candidate
  field before it changes operative dates, terms, or spending. Pending is not accepted.
- [ ] Preserve raw claim, excerpt, source, capture time, normalized value, and user correction.
- [ ] Prevent a conflict from overwriting a confirmed cutoff without an explicit comparison
  and decision. Keep both claims and the prior term version.
- [ ] Cover new, duplicate, and conflict candidates with domain-level tests.

Done when a pending or rejected amount/date does not enter a confirmed projection or reminder
preview, and resolving a conflict leaves an inspectable history. References: FR005, FR021–022.

### A2. Complete the interactive checkout simulation — P0

- [ ] Keep the existing mock merchant and persistent Simulation label. Add unknown-cutoff,
  ambiguous-date, and extraction-failure variants with manual correction paths.
- [ ] Show an editable planning target and a plain-language preview of action date, bill date,
  amount, source confidence, and reminder status before save.
- [ ] Distinguish detected checkout, local draft, user-confirmed purchase, and active record.
  Closing or declining must not create an active commitment.
- [ ] Record edited fields as user-confirmed claims, not as confirmation of the original
  simulated excerpt. Exercise Keep, Review, and Cancel separately.

Done when a participant can explain what was extracted, what was suggested, whether purchase
occurred, and whether cancellation has occurred. Reference: FR006.

### A3. Finish the synthetic review inbox — P0

- [ ] Preserve the split-pane desktop layout; provide a mobile Evidence/Fields switch without
  losing edits. Add fixtures for multiple plans, one-off receipts, missing fields, duplicate
  accounts, failed extraction, and conflicting terms.
- [ ] Make Add, Keep separate, Update existing, and Dismiss produce distinct, reversible
  outcomes. Announce errors and completion accessibly.
- [ ] State clearly that sample excerpts are synthetic. A real upload control belongs in C2.

Done when each sample candidate has a clear disposition and no dismissed or unresolved item
inflates coverage. References: FR004–005, FR021–022, FR028.

### A4. Align dates, spending, and settings — P0

- [ ] Consolidate projection rules used by Upcoming, Calendar, detail, and Spending. Define
  behavior for paused, trial, canceled, confirmed renewal-stop, unknown price, and term changes.
- [ ] Use saved planning buffers in target proposals. Make locale/timezone inputs affect the
  promised display behavior, or revise their labels until that behavior is implemented.
- [ ] Validate manual amount, interval, URLs, and related dates; show field-specific errors.
- [ ] Test monthly 31st and leap-year anchors, four-week cadence, annual notice cutoff, mixed
  currencies, unknown values, and future-effective price changes.

Done when the same commitment produces consistent dates and amounts on every route. References:
FR003, FR010–013, FR016–017.

### A5. Evaluate the prototype — P0

- [ ] Run the PRD's formative tasks for trial review, annual notice cutoff, Apple purchase,
  Calendar navigation, and cancellation-state comprehension using fictional data.
- [ ] Log observed errors and retest severe date or cancellation misunderstandings after fixes.

Done when prototype limitations and remaining usability failures are documented. This gate
permits a labeled demo, not a live-data launch. Reference: PRD Section 20.

## B. Web MVP foundation: identity, persistence, and privacy

### B1. Select and design one backend — P0

- [ ] Decide between Supabase (the PRD reference) and an equivalent Lovable Cloud path after
  checking region, export, storage, scheduler, cost, and deployment constraints.
- [ ] Define versioned schemas for owners, commitments, term versions, intention decisions,
  lifecycle/cancellation transitions, evidence artifacts and claims, import candidates,
  merge decisions, preferences, consent, reminder rules/jobs, and delivery attempts.
- [ ] Define unknown reasons, date precision and timezone, effective-term ranges, optimistic
  versions, and event payloads. Ensure historical payments and prior terms are retained.

Done when schema and migration/rollback design are reviewable before storing real evidence.
References: PRD Section 17; NFR001, NFR006.

### B2. Add authenticated, owner-scoped commands — P0

- [ ] Add sign-in/out and deep-link return. Validate input server-side and derive owner from
  the session, never from a client-supplied owner ID.
- [ ] Enforce owner policies on every table and private evidence object. Use short-lived access
  links, rate limits, safe URL handling, and secret isolation.
- [ ] Test cross-user read/write/export and evidence access through direct API requests.

Done when owner A cannot retrieve or modify any of owner B's data, including by guessed IDs
or signed evidence URLs. References: FR001, FR030; NFR001.

### B3. Replace local demo state for live accounts — P0

- [ ] Add a data-access layer under the current routes and components. Keep the synthetic
  fixture mode isolated from authenticated data and analytics.
- [ ] Use expected-version writes; on conflict, show a comparison and retain local edits.
- [ ] Make consequential changes append history and recompute derived views atomically.

Done when records survive devices and competing edits do not silently overwrite each other.
Reference: FR019.

### B4. Add recovery and data controls — P0

- [ ] Provide portable export including provenance and history; private-artifact retention
  choice; revocable access; and account deletion that suppresses jobs immediately.
- [ ] Configure encrypted backups, exercise restore and deletion in staging, and publish
  retention and backup-expiry behavior before accepting real uploads.

Done when export, deletion, and restore have observed test evidence. References: FR027;
NFR001, NFR004–005.

## C. Web MVP loop: real capture through timely decision

### C1. Onboarding and manual entry — P0

- [ ] Offer synthetic exploration and resumable account onboarding. Let users save one useful
  record without notifications or a complete inventory checklist.
- [ ] Offer manual, receipt/screenshot, and guided existing-subscription paths. Clarify that
  Apple subscriptions require user-guided discovery, not automatic inventory access.
- [ ] Capture original currency, structured recurrence, channel, intention, verified and
  unknown dates, and source/time on critical manual fields. Show a schedule preview.

Done when an incomplete but truthful record saves without inventing an exact billing date.
References: FR002–003, FR024.

### C2. Real file import and reviewed parsing — P0

- [ ] Accept validated PNG, JPEG, and PDF (proposed 10 MB limit); offer redaction guidance
  and private storage. Track queued, extracting, needs review, failed, and completed states.
- [ ] Use a server-side parser adapter that returns bounded, schema-validated claims with
  source locations. Provide timeout, retry, cancellation, and manual fallback.
- [ ] Split multiple subscriptions into candidates, flag repeat uploads by artifact hash, and
  keep one-off receipts from automatically becoming recurring commitments.
- [ ] Confirm candidate, write commitment/claims, and emit its scheduling event in one
  transactional operation.

Done when real evidence never enters trusted schedules without user review and parser failure
does not lose the user's work. References: FR004–005, FR021–022, FR030.

### C3. Complete the shared action and spending model — P0

- [ ] Compute Upcoming, Calendar, detail, and Spending from confirmed, versioned terms on the
  server. Preserve calendar anchors, exact versus estimated dates, and action priority.
- [ ] Separate normalized run rate, projected cash outflow, and observed payments. Report
  unknown amounts and partial inventory coverage, grouped by original currency.
- [ ] Apply accepted term changes from their effective date without rewriting past bills.

Done when a 31 October cutoff leads a 30 November bill; an annual EUR 120 term is EUR 10
monthly equivalent; EUR and USD are never added. References: FR010–013, FR016–017.

### C4. Complete cancellation and history — P0

- [ ] Review provider management links, retain Apple and unknown-channel guidance, and make
  handoff state distinct from user-confirmed completion.
- [ ] Record cancellation basis, renewal-stop and access-end dates separately. Keep reminders
  active while completion is unconfirmed; retain historical evidence and payments.
- [ ] Make corrections, merges, and consequential decisions inspectable and reversible.

Done when opening assistance never changes lifecycle to canceled and future billing stops
only after an appropriate confirmed state. References: FR017–019, FR021–022.

### C5. Add optional email reminders — P0

- [ ] Request consent after schedule preview. Keep every confirmed action visible in-app
  regardless of outbound permission.
- [ ] Implement versioned rules/jobs, transactional outbox, managed scheduler/worker,
  idempotency keys, dispatch-time consent/version checks, quiet hours, capped escalation,
  snooze limits, and useful-window expiry.
- [ ] Record queued, dispatched, provider accepted, failed, and suppressed separately.
  Support privacy text, authenticated deep links, unsubscribe, retries, and failure visibility.

Done when edits and consent revocation suppress obsolete jobs; duplicate worker runs send at
most one logical message; imported past events cause no burst. References: FR014–015,
FR029; NFR002.

### C6. Web pilot readiness — P0

- [x] Add local type, build, domain, and parser-contract checks; keep synthetic exploration
  clearly labeled and live OCR/email gated until configured.
- [x] Write the repeatable staging and pilot scenarios in `docs/web-mvp-verification.md`,
  including two-user authorization, OCR, reminders, accessibility, mobile, and usability.
- [ ] Prepare the incident support contact and deployed pilot copy once the target environment
  and operator are selected; this is tracked with the G4 release sign-off.

The actual staging, WCAG, p95, usability, recovery, and release evidence belongs to G. C code
readiness is not authorization for a real-user pilot. References: FR028–030; NFR001–005;
PRD Sections 20–21.

### C implementation status, 20 September 2026

The repository now includes `/onboarding`, truthful incomplete manual capture, private file
upload and reopen, duplicate suggestions, version-checked transactional acceptance and updates,
cancellation basis/correction, a bounded multi-item OCR adapter with timeout/retry/stop and
manual fallback, plus a consent-gated email outbox, bounded snooze, worker, and signed delivery
webhook. OCR and email remain disabled until their respective services are approved and
configured. `npm run verify:phase2`, `npm run verify:web-mvp`, TypeScript, the production build,
and a local demo browser smoke test pass. Scheduled forecasts are separate from observed
payments; no observed-payment import is offered in this MVP.

The remaining acceptance work is external deployment and pilot evidence in G: choose the OCR
processor and retention policy, configure staging and providers, run the direct API and service
tests in `docs/web-mvp-verification.md`, and record accessibility, performance, usability,
backup/restore, and go/no-go results. Repository checks cannot satisfy those release gates.

## D. V1: real Chromium browser capture

Repository implementation (20 September): a separate Manifest V3 package, user-invoked capture, optional scoped Stripe/Paddle detection, 24-hour local drafts, purchase-confirmed idempotent import into review, field provenance, explicit-date parsing, and user-selected term-change proposals are in place. `npm run verify:extension` passes on 25 synthetic fixtures; web import and settings routes were smoke tested. A browser connection capable of loading unpacked Chromium extensions was unavailable, so actual extension installation, live merchant precision/recall, and staging sync remain open release checks in Stage G. The fixtures do not establish the PRD's live supported-site precision gate.

### D1. Extension package and permissions — P0

- [ ] Build a separate Manifest V3 extension using a user-invoked current-page mode first.
  Offer optional, consented host access for a small supported-site set and retain manual
  fallback after denial.
- [ ] Limit extraction to relevant recurring terms; never read credentials or payment fields.
  Validate extension messages, sender/origin, and scoped backend credentials.

Done when no page is read before the relevant user gesture or host permission. Reference: FR007.

### D2. Durable purchase-state capture — P0

- [ ] Preserve uncompleted checkout as a disclosed local draft. Require user confirmation or
  suitable purchase evidence before activation; expire abandoned drafts as specified.
- [ ] Handle offline/sync errors truthfully and dedupe retries with a client request ID.
- [ ] Show source excerpts, unknowns, proposed planning target, and purchase-state preview
  in the real popup while reusing the established visual language.

Done when an abandoned checkout creates no active bill or reminder and one retry produces
one record. Reference: FR008.

### D3. Supported-site and change-proposal hardening — P0

- [ ] Test deterministic adapters against labeled pages, dynamic checkouts, ambiguous terms,
  and unsupported sites. Report precision and recall separately.
- [ ] Route evidenced future price or term changes into the review inbox; never silently
  rewrite confirmed terms or classify ambiguous tax/usage changes as price rises.

Done when the PRD's proposed precision gate and conflict-review checks pass. Reference: FR023.

## E. V1 optional capabilities

Repository implementation (20 September): PWA manifest and static offline fallback, consented push subscription/outbox/worker, and revocable calendar-feed token and endpoint are in place. Live VAPID, device delivery, feed revocation, database migrations and client refresh checks remain in Stage G. Neither channel is enabled in demo mode or without deployment configuration.

### E1. Installed PWA and push — P1

- [ ] Add manifest, installation guidance, service worker, safe offline read/draft behavior,
  optional push consent, and device-specific tests. Keep email and in-app fallback.

Done when supported devices receive and revoke push as described, without implying that a
PWA can read other apps' subscriptions. References: FR029; PRD Section 18.

### E2. Calendar export — P1

- [ ] Offer opt-in minimal events with stable IDs, updates/deletions, revocable feed token,
  and an explanation of delayed external-calendar refresh.

Done when repeated export does not duplicate events and revocation blocks future access.
Reference: FR020.

## F. V2: consented discovery

Repository implementation (20 September): provisional Gmail read-only OAuth and Plaid Transactions Link adapters, encrypted server-side tokens, one-time OAuth state, consent status/expiry/reconnect, bounded source scanning, observed-transaction grouping, review-only candidates, disconnect and separate unreviewed-finding removal are in place behind disabled flags. Local classifier and Edge syntax checks pass. The provider approval, scopes assessment, region/institution coverage, costs, OAuth/device flows, live token revocation, and two-user staging tests are outstanding in Stage G; this is not a production-enabled V2 connection.

### F1. Email discovery — P0 within V2

- [ ] Select viable provider and narrow scopes after verification/security review. Add
  revocable consent, token protection, limited ingestion, and candidate review.
- [ ] Disconnect must stop new ingestion; refusal must leave the core app usable.

Done when email findings remain unconfirmed candidates until reviewed. Reference: FR025.

### F2. Read-only recurring transaction discovery — P0 within V2

- [ ] Select a qualified partner and supported regions after cost/legal/security review.
  Present observed transactions and confidence; permit rejection of one-off or variable
  charges. Never infer a contractual cancellation cutoff from a transaction.

Done when consent expiry and reconnect are explicit and transaction evidence cannot
automatically overwrite merchant terms. Reference: FR026.

## G. Deployment depth: final release verification

This is the final operational stage for the chosen release scope. Repository builds establish
that code packages; they do not prove a deployed backend, private data boundary, delivery,
or recovery. No Supabase project URL or publishable key has been supplied yet, so the checks
below are outstanding. Record the target environment, date, operator, command or test case,
result, and evidence link for each item before marking it complete.

### G1. Environment and reproducible release — P0

- [ ] Choose production and staging regions, hosting target, domain, data residency, budget,
  and owners for the Supabase project and deployed app. Record the decision in the release log.
- [ ] Create separate staging and production projects. Set the Auth site URL, allowed redirect
  URLs, email confirmation, SMTP, abuse controls, and the public project URL/publishable key
  for each environment. Keep service-role credentials out of browser builds and Git.
- [ ] Apply and verify every migration in a fresh staging project, then rehearse the same
  sequence for production. Test constraints, RPC permissions, RLS policies, bucket privacy,
  rollback/forward-fix procedure, and schema compatibility with the deployed app version.
- [x] Keep Bun as the Lovable-connected package-manager baseline, update `bun.lock` for the
  Supabase dependencies, and pass a frozen lockfile check.
- [ ] Run a clean install and production build in CI, verify the deployed revision matches
  the tested commit, and test GitHub-to-Lovable sync. Preserve published Git history.
- [ ] Verify HTTPS, custom domain, environment-specific redirects, deep links, error pages,
  static assets, CSP/CORS and other response headers, and mobile layout on the hosted build.

Done when staging can be recreated from the repository and production deploys the exact
verified artifact without manual source edits.

### G2. Real account and data isolation probes — P0

- [ ] With two independent users, test sign-up, email confirmation, sign-in, session refresh,
  sign-out, expired session, direct-link return, and account switching in separate browsers.
- [ ] Attempt cross-user reads and writes through the UI, direct PostgREST requests, every
  versioned RPC, guessed IDs, exports, and Storage paths. Verify owner IDs always derive from
  the authenticated session and anonymous requests cannot access private rows or files.
- [ ] Exercise parallel edits to the same record and settings from two devices. Verify a stale
  version fails, the local draft remains exportable, both versions are visible, and an explicit
  user choice resolves the conflict without losing history.
- [ ] Verify no fixture, simulation record, browser-local draft, or sample analytics enters a
  live account. Test network failure, partial write, refresh, and retry for each record type.
- [ ] Run rate-limit, input-validation, upload-type/size, unsafe URL, and secret-exposure
  checks against the deployed app and API.
- [ ] Run `npm run verify:staging` with two disposable user sessions, then execute the
  remaining OCR, reminder, accessibility, and pilot scenarios in
  `docs/web-mvp-verification.md` and retain evidence.

Done when the cross-user and stale-write probes fail safely and the intended owner's data
survives browser restart and another device.

### G3. Evidence, export, deletion, and recovery — P0

- [ ] Test private evidence upload, access, revocation, expiry, and deletion using real
  staging files. Confirm neither a guessed object path nor an old signed link bypasses the
  intended access policy. Verify the retention schedule removes both metadata and bytes.
- [ ] Export a staging account with commitments, prior terms, claims, provenance, review
  decisions, history, preferences, and evidence references. Verify the export is complete,
  portable, and never includes another user's data.
- [ ] Delete a staging account with and without evidence. Verify sessions and jobs stop,
  rows and Storage objects are removed, and any retained backup copies follow the stated
  expiry policy. Test the failure and recovery path when object deletion is interrupted.
- [ ] Enable encrypted backups and point-in-time recovery at the selected service tier.
  Restore a backup into isolated staging and verify counts, ownership, RLS, Auth behavior,
  evidence access, and a representative end-to-end user flow. Record recovery time and loss
  against the agreed targets.
- [ ] Publish user-facing retention, deletion, and backup-expiry behavior before real uploads.

Done when export, deletion, and restore each have observed evidence, not just configuration.

### G4. Release operations and go/no-go — P0

- [ ] Approve Gmail restricted-scope use, Google verification and assessment obligations,
  data handling, and a separate staging OAuth client. Verify exact scope, one-time state,
  refresh, bounded scanning, disconnect/revocation, redacted excerpts and no raw email logs.
- [ ] Approve Plaid country/institution coverage, Transactions-only terms, pricing and
  security review before enabling the bank control. Test Link OAuth and update mode,
  consent expiry, posted/removed transaction sync, one-off and variable charge rejection,
  item removal and two-user isolation.
- [ ] Verify discovery keys and tokens stay server-side and encrypted, refusal leaves the
  core app usable, disconnect stops a concurrent scan, findings stay unconfirmed, and
  prior unreviewed findings can be removed separately from confirmed commitments.

- [ ] Load the separate unpacked Manifest V3 extension in Chromium, record its ID/version,
  inspect permission prompts, and verify current-page capture, optional Stripe/Paddle access,
  denial, revocation, badge detection, popup reopen, and 24-hour expiry on a clean profile.
- [ ] Run labeled live merchant and unsupported-page cases, including dynamic checkout and
  payment frames. Report precision and recall separately, inspect collected excerpts for
  credentials/payment data, and meet the PRD's at-least-95% supported-site precision gate.
- [ ] With staging accounts, verify abandoned checkout creates no bill/job, confirmed
  purchase enters review, retries with one request ID create one candidate, offline sync
  reports failure, and a term-change proposal leaves confirmed terms intact until review.
- [ ] Deploy and probe calendar-feed migration/function: token secrecy, stable event IDs,
  edits/deletions, rotation/revocation, owner isolation, and delayed client refresh.
- [ ] Deploy PWA push with VAPID and a private scheduled worker. Test explicit consent,
  denied permission, each supported device/browser, quiet hours, revocation, stale jobs,
  payload privacy, provider errors, and service-worker offline behavior.

- [ ] Run accessibility, responsive, major-browser, timezone, currency, and end-to-end
  acceptance checks on the hosted build for the features included in that release.
- [ ] Verify consent, opt-out, quiet hours, deduplication, retries, and delivery logging for
  each enabled reminder channel. Do not enable untested channels in production.
- [ ] Configure error reporting, health checks, backup failure alerts, job monitoring, and an
  incident contact. Check that logs redact evidence content, tokens, and financial details.
- [ ] Rehearse a deploy rollback or forward-fix, preserve a working database migration path,
  and record who can execute recovery. Check that Lovable still opens the synced project.
- [ ] Sign off a release checklist containing the deployed commit, migration versions, test
  evidence, known limitations, support path, and explicit go/no-go decision.

Done when the selected release is operable and its remaining limitations are documented.

## Decisions required before each dependent stage

1. Before B1: choose hosting/backend region, budget, storage retention, scheduler, and parser
   processor policy. Record the decision and rationale.
2. Before C2: approve real-evidence handling, retention, parser disclosure, and manual fallback.
3. Before C5: configure notification domain/provider, consent text, quiet-hour behavior, and
   monitoring. Do not equate provider acceptance with delivery.
4. Before D1: select supported merchants and permission model from user research.
5. Before F1/F2: confirm integration eligibility, scopes, consent, region, operational cost,
   and revocation plan.

The PRD's research hypotheses and proposed thresholds are validation targets, not claims of
measured user outcomes. Automated cancellation, money movement, password storage, universal
subscription access, and guaranteed savings remain outside this roadmap.

# Commit — Phase 1: core interactive foundation

A responsive web app for tracking subscriptions and recurring commitments, built around
*intention* (what you plan to do) rather than billing dates. Phase 1 runs entirely on
realistic sample data held in the browser — no accounts, no real charges, no reminders sent.
Every screen is labelled as demo data.

## Screens

**Upcoming (home)** — the default screen. A 30-day list ordered by when you actually need to
act, not when you get billed. Sections: "Overdue or window passed" (stays visible until you
decide or acknowledge), Today, Next 7 days, Later, and a separate "Needs a date" bucket for
items with unknown deadlines. Active trials show a countdown. Each row reads like
"Atlas Studio - Review by 27 September - Bills EUR 12 on 30 September" with one primary action.
A side summary shows coverage ("Based on 6 tracked commitments, 2 have unknown prices").

**Calendar** — month grid plus an agenda list. Action cutoffs and billing dates are visually
and textually distinct (shape, icon and label, never colour alone). Estimated bills are shown
dashed and marked "Estimated". When a cutoff and a bill fall on the same day, both appear with
an explanation. Full keyboard navigation between days, screen-reader labels on every event,
and an agenda-first layout on mobile. Filters change what is displayed, never the saved dates.

**Subscriptions** — searchable inventory with filters for lifecycle, intention, channel and
category.

**Subscription detail** — header with merchant, plan, purchase channel, lifecycle and
intention. Separate blocks for next action (with its basis) and next bill (amount in its
original currency, date, certainty). Tabs: Overview, Terms and evidence (each field shows its
value, where it came from, when captured, and whether confirmed), Reminders (preview only),
History. Cancellation guidance branches by channel: web purchases open the provider's own
management page in a new tab with a clear handoff note; Apple purchases show Apple's own
device steps; unknown channel first asks who bills you. The flow is Start cancellation ->
"Have you completed it?" -> your confirmation, with renewal-stop and access-end recorded
separately. Nothing is ever cancelled on the user's behalf.

**Add commitment** — manual entry with merchant, plan, channel, price in its original
currency, interval (every N days/weeks/months/years), billing anchor, trial end, cutoff,
notice period, and intention. Choosing Review or Cancel proposes a target date using the
default buffers (Review: 3 days before the earliest cutoff or bill; Cancel: 2 days before the
cutoff, or 3 days before the bill when the cutoff is unknown), always editable. Setting a
target later than the cutoff warns and requires explicit acknowledgement. Unknown stays
unknown — never filled with a guess.

**Settings** — timezone, locale, reminder preferences (preview only, clearly not sending),
buffer defaults, and a note about demo data.

## Core model

Four independent dimensions, never silently changing each other:

- Intention: Keep / Review / Cancel
- Lifecycle: draft / trial / active / paused / canceled / expired
- Cancellation workflow: not started / in progress / awaiting confirmation / confirmed
- Field verification: unconfirmed / confirmed / conflicted

Five distinct date fields with their own labels: billing date, trial end, merchant action
cutoff, review target, access end. Wording rules: "Review before", "Cancel by", "Bills on",
"You plan to cancel", "Cancellation confirmed by you". No generic "due date".

Recurrence uses calendar arithmetic with a preserved day-of-month anchor (31 January monthly
becomes 28 February, then 31 March), a disclosed last-valid-day rule for leap years, and
support for multi-unit custom intervals. Amounts are stored in minor units with an ISO
currency; different currencies are grouped, never added together. Unknown is a real value
with a reason, never zero.

## Technical notes

- TanStack Start routes: `/upcoming`, `/calendar`, `/subscriptions`, `/subscriptions/$id`,
  `/add`, `/settings`; `/` redirects to `/upcoming`. Each route sets its own page title and
  description.
- Domain logic in `src/lib/commit/`: types, recurrence/date arithmetic (pure functions),
  buffer/target proposal, upcoming-list bucketing, calendar occurrence generation, money
  formatting.
- Synthetic fixtures in `src/lib/commit/fixtures.ts`: ~10 commitments covering a trial ending
  soon, an annual contract with an October notice cutoff for a November bill, an Apple App
  Store purchase, an unknown-cutoff record, an unknown-price record, a past-cutoff record, a
  paused one, a 4-week cycle, a 31st-of-month anchor, and a non-EUR currency. Fixture dates
  are relative to today so the demo always looks live.
- Client-side state via a store + localStorage so edits, intention changes and acknowledgements
  persist across reloads within Phase 1.
- Design system tokens in `src/styles.css`; no hardcoded colours in components. Distinct
  non-generic visual direction, light and dark.
- Accessibility: keyboard grid navigation in the calendar, `aria-live` on bucket changes,
  labelled events, visible focus.

## Not in Phase 1

Backend and accounts, outbound reminders, browser-capture extension, spending screen, review
inbox, calendar export, imports and evidence uploads.

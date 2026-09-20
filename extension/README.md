# Commit Chromium capture (Manifest V3)

This is a separate unpacked extension package. Load the `extension/` directory through Chromium's **Extensions → Developer mode → Load unpacked**. Set the Commit web app origin in extension settings (`https://…`; `http://localhost` is allowed only for development). The web app must have a configured Supabase project and a signed-in account. The labeled `/demo/checkout` page remains a simulation.

## Permission and capture model

- Clicking the popup's **Capture current page** gives `activeTab` access for that tab and invokes `extract.js`. The extension reads short text excerpts from visible content, excluding form controls, scripts, frames, and editable nodes. Passwords and payment inputs are never traversed. Card-like numbers and email addresses in excerpts are redacted.
- Optional **Enable site detection** requests host access only for `checkout.stripe.com` or `*.paddle.com`. The registered content script sends only a boolean signal to set a badge. No page text is stored or sent at that point. Revoking permission unregisters the script. Unsupported pages retain user-invoked capture and manual entry.
- The parser proposes only terms with local text evidence. English explicit dates are recognized; other dates remain blank for correction. Tax, usage, and ambiguous prices require human review. Unknown terms remain unknown.
- A pending draft is held in `chrome.storage.local` for up to 24 hours from first capture. Saving again does not extend that lifetime. Incomplete purchases create no web record or reminder. The popup requires explicit purchase confirmation before opening the signed-in web import route.
- The extension stores no Supabase key or user session. The app receives the minimal candidate in a URL fragment, immediately moves it into tab session storage, removes the fragment, and validates it. A random request ID becomes the candidate ID. The database unique key makes retries idempotent. The web review inbox requires a field decision before activation; choosing an existing commitment proposes a conflict, never updates its confirmed terms directly.

## Local checks

Run `npm run verify:extension`, `npx tsc --noEmit`, and `npm run build` at the repository root. The fixture set exercises recurring versus one-off language, amount, currency, interval, explicit date extraction, and the least-privilege manifest. Its precision/recall figures apply only to those checked-in fixtures, not to live merchant pages.

## Release checks still required

Use a Chromium browser with this unpacked extension loaded and a staging Commit account. Test popup reopen and 24-hour expiry, unsupported pages, denied and revoked site permission, Stripe and Paddle checkout pages at current versions, payment-field exclusion, dynamic page changes, confirmed and abandoned checkouts, offline/retry behavior, duplicate request IDs, sign-in return, field review, term-change proposals, and no reminder for a draft. Record observed precision and recall on a separately labeled merchant set. Store submission and extension signing are separate release steps. No store claim or live merchant compatibility is established by the fixture test alone.

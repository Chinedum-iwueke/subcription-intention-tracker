# Subcription Intention Tracker

Build Commit, an intention-aware subscription and recurring commitment tracker web app based on the attached PRD. Implement Phase 1: the core interactive foundation with realistic synthetic fixtures. Include:
1. Navigation and routing: /upcoming, /calendar, /subscriptions, /subscriptions/:id, /add, and /settings.
2. The core intention and date model: strictly separate intention (Keep, Review, Cancel) from lifecycle (Trial, Active, Paused, Canceled), and prioritize action cutoff / review targets over billing dates.
3. Upcoming view: 30-day timeline ordered by action deadlines with an overdue/passed-window section, active trials countdown, and a 'Needs a date' bucket.
4. Calendar & Agenda view: distinct visual treatments for action cutoff vs. billing dates, keyboard and screen-reader accessible.
5. Subscription details & cancellation guidance: terms provenance, original currency display, and channel-based cancellation playbooks (Web vs Apple App Store).
6. Manual entry form: support multi-interval recurrence, custom buffers, original currency, and intention selection.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9aa3ef8b-65b2-4a3c-b4df-846d9f07fa43).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

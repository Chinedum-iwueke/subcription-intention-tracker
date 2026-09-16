import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, Info } from "lucide-react";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { CommitmentRow } from "@/components/commit/CommitmentRow";
import { SampleTag } from "@/components/commit/badges";
import { Button } from "@/components/ui/button";
import { addDays, formatDayMonth } from "@/lib/commit/dates";
import { activeTrials, buildUpcoming } from "@/lib/commit/derive";
import { coverageSummary, formatMoney } from "@/lib/commit/money";
import { useCommitStore, useToday } from "@/lib/commit/store";

export const Route = createFileRoute("/upcoming")({
  head: () => ({
    meta: [
      { title: "Upcoming actions — Commit" },
      {
        name: "description",
        content:
          "A 30-day timeline of your recurring commitments ordered by when you need to act, not when you get billed.",
      },
      { property: "og:title", content: "Upcoming actions — Commit" },
      {
        property: "og:description",
        content: "See what needs a decision next, before the action window closes.",
      },
    ],
  }),
  component: UpcomingPage,
});

const BUCKET_NOTES: Record<string, string> = {
  passed:
    "These stay visible until you decide or acknowledge them. An expired window is not a promise that nothing can be done.",
  needs_date:
    "No cutoff or planning target is recorded. Commit will not invent one — set a date when you know it.",
  later: "Further out in the 30-day window.",
};

function UpcomingPage() {
  const { commitments } = useCommitStore();
  const today = useToday();
  const { buckets, beyondHorizon } = buildUpcoming(commitments, today);
  const trials = activeTrials(commitments, today);
  const coverage = coverageSummary(commitments);
  const total = buckets.reduce((n, b) => n + b.items.length, 0);

  return (
    <AppShell
      title="Upcoming"
      lede={`Ordered by the date you need to act on, ${formatDayMonth(today)} to ${formatDayMonth(addDays(today, 30))}. Billing dates follow the action, they do not lead it.`}
      aside={
        <div className="space-y-5">
          <Panel title="Coverage" description="Sample records only. Nothing here is a real charge.">
            <p className="text-sm">
              Based on{" "}
              <strong className="font-medium">{coverage.tracked} tracked commitments</strong>.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {coverage.totals.map((t) => (
                <li key={t.currency} className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t.currency} · {t.counted} records
                  </span>
                  <span className="font-mono text-sm">
                    {formatMoney(t.monthlyMinor, t.currency)} / month
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Currencies are grouped, never added together. {coverage.unknownAmounts} record
              {coverage.unknownAmounts === 1 ? " has" : "s have"} an unknown or variable amount and
              {coverage.unknownAmounts === 1 ? " is" : " are"} excluded from these figures.
            </p>
            <div className="mt-4">
              <SampleTag />
            </div>
          </Panel>

          <Panel title="Active trials" description="Counting down to the end of free access.">
            {trials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trials are running.</p>
            ) : (
              <ul className="space-y-3">
                {trials.map(({ commitment, daysLeft }) => (
                  <li key={commitment.id} className="flex items-start gap-3">
                    <AlarmClock className="mt-0.5 size-4 shrink-0 text-trial" aria-hidden="true" />
                    <div className="min-w-0">
                      <Link
                        to="/subscriptions/$id"
                        params={{ id: commitment.id }}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {commitment.merchant}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {daysLeft <= 0
                          ? "Trial ends today"
                          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}{" "}
                        · ends {formatDayMonth(commitment.trialEndDate!)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      }
    >
      <div aria-live="polite" className="sr-only">
        {total} commitments need a decision in this window.
      </div>

      <div className="space-y-6">
        {buckets.map((bucket) => (
          <Panel
            key={bucket.id}
            title={bucket.title}
            description={BUCKET_NOTES[bucket.id]}
            actions={
              <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                {bucket.items.length}
              </span>
            }
            className={bucket.id === "passed" && bucket.items.length ? "border-warn/50" : undefined}
          >
            {bucket.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {bucket.id === "next7"
                  ? "No tracked actions in the next 7 days."
                  : bucket.id === "today"
                    ? "No tracked actions today."
                    : "Nothing in this section."}
              </p>
            ) : (
              <ul>
                {bucket.items.map((item) => (
                  <CommitmentRow key={item.commitment.id} item={item} today={today} />
                ))}
              </ul>
            )}
          </Panel>
        ))}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {beyondHorizon} commitment{beyondHorizon === 1 ? "" : "s"} have an action date beyond
            the next 30 days. Commitments you chose to keep are informational and do not appear
            here.{" "}
            <Link to="/subscriptions" className="underline underline-offset-4">
              See the full inventory
            </Link>
            .
          </span>
        </p>

        <div className="rounded-lg border border-dashed border-border p-5">
          <h2 className="text-lg">Nothing here yet?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a trial you want to remember. Commit records what you intend to do and brings it
            back while there is still time to act.
          </p>
          <Button asChild className="mt-4">
            <Link to="/add">Add a commitment</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

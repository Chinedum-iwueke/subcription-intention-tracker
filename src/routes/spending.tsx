import { createFileRoute, Link } from "@tanstack/react-router";
import { Info, TriangleAlert } from "lucide-react";
import * as React from "react";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { EventMarker, SampleTag } from "@/components/commit/badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { describeRecurrence, formatDayMonth, todayISO } from "@/lib/commit/dates";
import { formatMoney } from "@/lib/commit/money";
import { useCommitStore, useToday } from "@/lib/commit/store";
import {
  bucketByCurrency,
  buildCoverage,
  monthBounds,
  projectedOutflow,
  scheduledBills,
  termAt,
  UNPRICED_REASON_LABEL,
  weeklyOutflow,
} from "@/lib/commit/spending";

export const Route = createFileRoute("/spending")({
  head: () => ({
    meta: [
      { title: "Spending and coverage — Commit" },
      {
        name: "description",
        content:
          "Monthly and annual equivalents, bills scheduled this month and projected outflow, grouped strictly by original currency.",
      },
      { property: "og:title", content: "Spending and coverage — Commit" },
      {
        property: "og:description",
        content:
          "See what your tracked commitments cost per currency, and how much of your inventory has no known price.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpendingPage,
});

function SpendingPage() {
  const { commitments, mode } = useCommitStore();
  const today = useToday();
  const [view, setView] = React.useState("monthly");

  const coverage = buildCoverage(commitments);
  const month = monthBounds(today);
  const monthBills = scheduledBills(commitments, today, month.end);
  const monthBuckets = bucketByCurrency(monthBills);
  const periods = projectedOutflow(commitments, today, 6);
  const weeks = weeklyOutflow(commitments, today, 4);

  return (
    <AppShell
      title="Spending and coverage"
      lede="Every figure below is an equivalent calculated from a 364-day reference year, not a bank balance. Currencies are reported separately and are never converted or added together."
      aside={
        <div className="space-y-5">
          <Panel title="Coverage" description="How much of your inventory these figures actually describe.">
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Tracked commitments</dt>
                <dd className="font-mono">{coverage.inScope}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">With a known price</dt>
                <dd className="font-mono">{coverage.priced}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Price unknown</dt>
                <dd className="font-mono text-warn">{coverage.unpriced.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Currencies in use</dt>
                <dd className="font-mono">{coverage.groups.length}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              An unknown price is a real value with a reason. It is never counted as zero, so these
              totals describe {coverage.priced} of {coverage.inScope} commitments.
            </p>
            {mode === "demo" ? <div className="mt-4"><SampleTag /></div> : null}
          </Panel>

          <Panel title="Unknown prices" description="Excluded from every total on this page.">
            {coverage.unpriced.length === 0 ? (
              <p className="text-sm text-muted-foreground">Every tracked commitment has a price.</p>
            ) : (
              <ul className="space-y-3">
                {coverage.unpriced.map(({ commitment, reason }) => (
                  <li key={commitment.id} className="text-sm">
                    <Link
                      to="/subscriptions/$id"
                      params={{ id: commitment.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {commitment.merchant}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {UNPRICED_REASON_LABEL[reason]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      }
    >
      <Tabs value={view} onValueChange={setView} className="space-y-6">
        <TabsList aria-label="Spending view">
          <TabsTrigger value="monthly">Monthly equivalent</TabsTrigger>
          <TabsTrigger value="annual">Annual equivalent</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled bills this month</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-5">
          <EquivalentView coverage={coverage} basis="monthly" />
        </TabsContent>

        <TabsContent value="annual" className="space-y-5">
          <EquivalentView coverage={coverage} basis="annual" />
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-5">
          <Panel
            title={`Bills scheduled between ${formatDayMonth(today)} and ${formatDayMonth(month.end)}`}
            description="Expected charges, not payments taken. Estimated amounts are marked and drawn with a dashed marker."
          >
            {monthBuckets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No bills fall in the rest of this month.
              </p>
            ) : (
              <>
                <ul className="mb-5 grid gap-3 sm:grid-cols-2">
                  {monthBuckets.map((b) => (
                    <li key={b.currency} className="rounded-md border border-border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {b.currency} total
                      </p>
                      <p className="font-mono text-xl">{b.count === b.unknownCount ? "Amount unknown" : formatMoney(b.totalMinor, b.currency)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {b.count} bill{b.count === 1 ? "" : "s"}
                        {b.unknownCount ? ` · ${b.unknownCount} with an unknown amount` : ""}
                        {b.estimatedCount ? ` · ${b.estimatedCount} estimated` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                <ul className="divide-y divide-border">
                  {monthBills.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                      <EventMarker type="bill" estimated={b.estimated} />
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatDayMonth(b.date)}
                      </span>
                      <Link
                        to="/subscriptions/$id"
                        params={{ id: b.commitment.id }}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {b.commitment.merchant}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {describeRecurrence(b.commitment.terms.recurrence)}
                      </span>
                      <span className="ml-auto font-mono text-sm">
                        {formatMoney(b.amountMinor, b.currency)}
                        {b.estimated ? (
                          <span className="ml-2 text-xs font-sans text-muted-foreground">
                            Estimated
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      <Panel
        className="mt-6"
        title="Projected cash outflow"
        description="Projected from the recorded schedules. A projection is not a confirmed charge, and a cancellation you confirm removes the bills that follow it."
      >
        <h3 className="text-sm font-medium">Next four weeks</h3>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {weeks.map((w) => (
            <li key={w.key} className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">
                {formatDayMonth(w.start)} – {formatDayMonth(w.end)}
              </p>
              {w.buckets.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No bills</p>
              ) : (
                w.buckets.map((b) => (
                  <p key={b.currency} className="mt-1 font-mono text-sm">
                    {b.count === b.unknownCount ? `${b.currency} amount unknown` : formatMoney(b.totalMinor, b.currency)}
                    {b.unknownCount ? <span className="text-warn"> +?</span> : null}
                  </p>
                ))
              )}
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-sm font-medium">Next six months</h3>
        <ul className="mt-3 space-y-2">
          {periods.map((p) => (
            <li
              key={p.key}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-border px-3 py-2.5"
            >
              <span className="text-sm">{p.label}</span>
              <span className="text-xs text-muted-foreground">
                {p.bills.length} bill{p.bills.length === 1 ? "" : "s"}
              </span>
              <span className="flex flex-wrap gap-4">
                {p.buckets.length === 0 ? (
                  <span className="text-sm text-muted-foreground">None scheduled</span>
                ) : (
                  p.buckets.map((b) => (
                    <span key={b.currency} className="font-mono text-sm">
                      {b.count === b.unknownCount ? `${b.currency} amount unknown` : formatMoney(b.totalMinor, b.currency)}
                      {b.unknownCount ? (
                        <span className="ml-1 text-xs font-sans text-warn">
                          + {b.unknownCount} unknown
                        </span>
                      ) : null}
                    </span>
                  ))
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Each currency is totalled on its own line. EUR, GBP and USD figures sit side by side
            and are never combined into a single number.
          </span>
        </p>
      </Panel>
    </AppShell>
  );
}

function EquivalentView({
  coverage,
  basis,
}: {
  coverage: ReturnType<typeof buildCoverage>;
  basis: "monthly" | "annual";
}) {
  const label = basis === "monthly" ? "per month" : "per year";

  if (coverage.groups.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-muted-foreground">
          No tracked commitment has both a price and a schedule yet.
        </p>
      </Panel>
    );
  }

  return (
    <>
      {coverage.groups.map((g) => {
        const total = basis === "monthly" ? g.monthlyMinor : g.annualMinor;
        return (
          <Panel
            key={g.currency}
            title={`${g.currency} commitments`}
            description={`${g.lines.length} commitment${g.lines.length === 1 ? "" : "s"} billed in ${g.currency}.`}
            actions={
              <div className="text-right">
                <p className="font-mono text-2xl leading-none">{formatMoney(total, g.currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}, equivalent</p>
              </div>
            }
          >
            <ul className="divide-y divide-border">
              {g.lines.map((line) => (
                <li
                  key={line.commitment.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                >
                  <Link
                    to="/subscriptions/$id"
                    params={{ id: line.commitment.id }}
                    className="text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {line.commitment.merchant}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(termAt(line.commitment, todayISO()).amountMinor, g.currency)}{" "}
                    · {describeRecurrence(termAt(line.commitment, todayISO()).recurrence)}
                  </span>
                  <span className="ml-auto font-mono text-sm">
                    {formatMoney(
                      basis === "monthly" ? line.monthlyMinor : line.annualMinor,
                      g.currency,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Equivalents use a 364-day reference year, so a four-week cycle counts as 13 charges a
          year rather than 12. They describe the shape of a commitment, not the amount that will
          leave your account in any given month.
        </span>
      </p>
    </>
  );
}

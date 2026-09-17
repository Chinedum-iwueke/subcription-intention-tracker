import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { Search } from "lucide-react";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { ChannelBadge, IntentionBadge, LifecycleBadge } from "@/components/commit/badges";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { describeRecurrence, formatDayMonth } from "@/lib/commit/dates";
import { nextAction } from "@/lib/commit/derive";
import { formatMoney } from "@/lib/commit/money";
import { useCommitStore, useToday } from "@/lib/commit/store";
import {
  CHANNEL_LABEL,
  INTENTION_LABEL,
  LIFECYCLE_LABEL,
  type Intention,
  type Lifecycle,
  type PurchaseChannel,
} from "@/lib/commit/types";

export const Route = createFileRoute("/subscriptions/")({
  head: () => ({
    meta: [
      { title: "All subscriptions — Commit" },
      {
        name: "description",
        content:
          "A searchable inventory of every tracked commitment, filtered by intention, lifecycle, channel and category.",
      },
      { property: "og:title", content: "All subscriptions — Commit" },
      {
        property: "og:description",
        content: "Every tracked recurring commitment in one searchable inventory.",
      },
    ],
  }),
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { commitments } = useCommitStore();
  const today = useToday();
  const [query, setQuery] = React.useState("");
  const [intention, setIntention] = React.useState<Intention | "all">("all");
  const [lifecycle, setLifecycle] = React.useState<Lifecycle | "all">("all");
  const [channel, setChannel] = React.useState<PurchaseChannel | "all">("all");

  const filtered = commitments.filter((c) => {
    const q = query.trim().toLowerCase();
    const matchQ =
      !q ||
      c.merchant.toLowerCase().includes(q) ||
      c.planNickname.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q);
    return (
      matchQ &&
      (intention === "all" || c.intention === intention) &&
      (lifecycle === "all" || c.lifecycle === lifecycle) &&
      (channel === "all" || c.channel === channel)
    );
  });

  return (
    <AppShell
      title="Subscriptions"
      lede="Every tracked commitment, including the ones you deliberately chose to keep. Filters change what is shown, never a saved date."
    >
      <Panel className="mb-6">
        <label htmlFor="sub-search" className="mb-1.5 block text-sm font-medium">
          Search
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="sub-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Merchant, plan or category"
            className="pl-9"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <FilterGroup
            legend="Intention"
            value={intention}
            onChange={setIntention}
            options={Object.entries(INTENTION_LABEL) as [Intention, string][]}
          />
          <FilterGroup
            legend="Lifecycle"
            value={lifecycle}
            onChange={setLifecycle}
            options={Object.entries(LIFECYCLE_LABEL) as [Lifecycle, string][]}
          />
          <FilterGroup
            legend="Channel"
            value={channel}
            onChange={setChannel}
            options={Object.entries(CHANNEL_LABEL) as [PurchaseChannel, string][]}
          />
        </div>
      </Panel>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {commitments.length} tracked commitments.
      </p>

      <ul className="space-y-3">
        {filtered.map((c) => {
          const action = nextAction(c, today);
          return (
            <li key={c.id}>
              <Link
                to="/subscriptions/$id"
                params={{ id: c.id }}
                className="block rounded-lg border border-border bg-paper p-5 transition-colors hover:border-ring"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl">{c.merchant}</h2>
                  <span className="font-mono text-sm">
                    {formatMoney(c.terms.amountMinor, c.terms.currency)}
                    <span className="text-muted-foreground">
                      {" "}
                      · {describeRecurrence(c.terms.recurrence)}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.planNickname} · {c.category}
                </p>
                <p className="mt-2 text-sm">
                  {action.date ? (
                    <span className="text-action">
                      {action.verb} {formatDayMonth(action.date)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No decision scheduled</span>
                  )}
                  <span className="text-muted-foreground">
                    {" · "}
                    {c.nextBillDate
                      ? `Bills on ${formatDayMonth(c.nextBillDate)}`
                      : "No next bill projected"}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <IntentionBadge intention={c.intention} />
                  <LifecycleBadge lifecycle={c.lifecycle} />
                  <ChannelBadge channel={c.channel} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No commitments match these filters. Clearing a filter does not change any saved date.
          </p>
          <Button asChild className="mt-4">
            <Link to="/add">Add a commitment</Link>
          </Button>
        </Panel>
      ) : null}
    </AppShell>
  );
}

function FilterGroup<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T | "all";
  onChange: (v: T | "all") => void;
  options: [T, string][];
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={value === "all" ? "default" : "outline"}
          aria-pressed={value === "all"}
          onClick={() => onChange("all")}
        >
          All
        </Button>
        {options.map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={value === id ? "default" : "outline"}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

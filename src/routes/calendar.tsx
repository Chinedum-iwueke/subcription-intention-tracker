import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { EventMarker } from "@/components/commit/badges";
import { Button } from "@/components/ui/button";
import {
  addDays,
  formatWeekdayLong,
  lastDayOfMonth,
  monthLabel,
  parseISODate,
  toISODate,
  todayISO,
} from "@/lib/commit/dates";
import { buildCalendarEvents, type CalendarEvent } from "@/lib/commit/derive";
import { useCommitStore, useToday } from "@/lib/commit/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar and agenda — Commit" },
      {
        name: "description",
        content:
          "A month and agenda view that keeps action cutoffs visually and textually distinct from billing dates.",
      },
      { property: "og:title", content: "Calendar and agenda — Commit" },
      {
        property: "og:description",
        content: "Action cutoffs and billing dates, told apart by shape and label — never colour alone.",
      },
    ],
  }),
  component: CalendarPage,
});

type Filter = "all" | "action" | "bill" | "trial_end";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(year: number, monthIndex: number) {
  return toISODate(new Date(Date.UTC(year, monthIndex, 1)));
}

function CalendarPage() {
  const { commitments } = useCommitStore();
  const today = useToday();
  const base = parseISODate(today || todayISO());

  const [cursor, setCursor] = React.useState({
    year: base.getUTCFullYear(),
    month: base.getUTCMonth(),
  });
  const [selected, setSelected] = React.useState<string>(today);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [mode, setMode] = React.useState<"month" | "agenda">("month");
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setSelected(today), [today]);

  const monthStart = startOfMonth(cursor.year, cursor.month);
  const daysInMonth = lastDayOfMonth(cursor.year, cursor.month);
  const monthEnd = addDays(monthStart, daysInMonth - 1);

  const allEvents = React.useMemo(
    () => buildCalendarEvents(commitments, monthStart, monthEnd),
    [commitments, monthStart, monthEnd],
  );
  const events = React.useMemo(
    () => (filter === "all" ? allEvents : allEvents.filter((e) => e.type === filter)),
    [allEvents, filter],
  );

  const byDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [events]);

  // Monday-first leading blanks.
  const firstWeekday = (parseISODate(monthStart).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  function moveSelection(days: number) {
    const next = addDays(selected, days);
    const d = parseISODate(next);
    if (d.getUTCFullYear() !== cursor.year || d.getUTCMonth() !== cursor.month) {
      setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    }
    setSelected(next);
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
    });
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -daysInMonth,
      PageDown: daysInMonth,
    };
    if (e.key in map) {
      e.preventDefault();
      moveSelection(map[e.key]);
    }
    if (e.key === "Home") {
      e.preventDefault();
      setSelected(monthStart);
    }
    if (e.key === "End") {
      e.preventDefault();
      setSelected(monthEnd);
    }
  }

  const selectedEvents = byDate.get(selected) ?? [];
  const agenda = events.filter((e) => e.date >= selected);
  const sameDayClash =
    selectedEvents.some((e) => e.type === "action") && selectedEvents.some((e) => e.type === "bill");

  return (
    <AppShell
      title="Calendar"
      lede="Action cutoffs and billing dates are different kinds of event. They are told apart by shape, icon and wording — never by colour alone."
      aside={
        <div className="space-y-5">
          <Panel title="Legend">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <EventMarker type="action" />
                <span>
                  <strong className="font-medium">Action</strong> — a cutoff or planning target. Act
                  by this day.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <EventMarker type="bill" />
                <span>
                  <strong className="font-medium">Bills on</strong> — an expected charge.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <EventMarker type="bill" estimated />
                <span>
                  <strong className="font-medium">Estimated bill</strong> — dashed. Not confirmed,
                  and not paid.
                </span>
              </li>
              <li className="flex items-center gap-3">
                <EventMarker type="trial_end" />
                <span>
                  <strong className="font-medium">Trial ends</strong> — free access stops.
                </span>
              </li>
            </ul>
          </Panel>
          <Panel title="Filters" description="Filtering changes what is displayed, never a saved date or reminder.">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All events"],
                  ["action", "Actions only"],
                  ["bill", "Bills only"],
                  ["trial_end", "Trial ends"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={filter === id ? "default" : "outline"}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Panel>
        </div>
      }
    >
      <div className="space-y-6">
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
              <h2 className="min-w-44 text-center text-xl" aria-live="polite">
                {monthLabel(cursor.year, cursor.month)}
              </h2>
              <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={mode === "month" ? "default" : "outline"}
                onClick={() => setMode("month")}
                aria-pressed={mode === "month"}
              >
                Month
              </Button>
              <Button
                size="sm"
                variant={mode === "agenda" ? "default" : "outline"}
                onClick={() => setMode("agenda")}
                aria-pressed={mode === "agenda"}
              >
                Agenda
              </Button>
            </div>
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            Use the arrow keys to move between dates, Home and End for the first and last day of the
            month, and Enter to open the day&apos;s agenda below.
          </p>

          {mode === "month" ? (
            <div
              ref={gridRef}
              role="grid"
              aria-label={`Commitments in ${monthLabel(cursor.year, cursor.month)}`}
              onKeyDown={onGridKeyDown}
              className="overflow-hidden rounded-md border border-border"
            >
              <div role="row" className="grid grid-cols-7 border-b border-border bg-muted">
                {WEEKDAY_SHORT.map((w) => (
                  <div
                    key={w}
                    role="columnheader"
                    className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
                  >
                    {w}
                  </div>
                ))}
              </div>
              {Array.from({ length: cells.length / 7 }, (_, row) => (
                <div role="row" key={row} className="grid grid-cols-7">
                  {cells.slice(row * 7, row * 7 + 7).map((date, i) => {
                    if (!date)
                      return (
                        <div
                          role="gridcell"
                          key={`b-${row}-${i}`}
                          className="min-h-24 border-r border-t border-border bg-muted/40 last:border-r-0"
                        />
                      );
                    const dayEvents = byDate.get(date) ?? [];
                    const isToday = date === today;
                    const isSelected = date === selected;
                    return (
                      <div role="gridcell" key={date} className="border-r border-t border-border last:border-r-0">
                        <button
                          type="button"
                          data-date={date}
                          tabIndex={isSelected ? 0 : -1}
                          aria-selected={isSelected}
                          aria-current={isToday ? "date" : undefined}
                          aria-label={`${formatWeekdayLong(date)}. ${
                            dayEvents.length === 0
                              ? "No events."
                              : dayEvents.map((e) => e.description).join(" ")
                          }`}
                          onClick={() => setSelected(date)}
                          className={cn(
                            "flex min-h-24 w-full flex-col gap-1 p-2 text-left transition-colors hover:bg-accent/60",
                            isSelected && "bg-accent",
                          )}
                        >
                          <span
                            className={cn(
                              "text-xs font-medium",
                              isToday && "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground",
                            )}
                          >
                            {parseISODate(date).getUTCDate()}
                          </span>
                          <span className="flex flex-col gap-1">
                            {dayEvents.slice(0, 3).map((e) => (
                              <span key={e.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                                <EventMarker type={e.type} estimated={e.estimated} />
                                <span className="truncate">
                                  {e.type === "action" ? "Act" : e.type === "bill" ? "Bill" : "Trial"}
                                  {" · "}
                                  {e.commitment.merchant}
                                </span>
                              </span>
                            ))}
                            {dayEvents.length > 3 ? (
                              <span className="text-[11px] text-muted-foreground">
                                +{dayEvents.length - 3} more
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <AgendaList events={agenda} heading={`From ${formatWeekdayLong(selected)}`} />
          )}
        </Panel>

        <Panel title={formatWeekdayLong(selected)} description="Day agenda. Every event carries its full label.">
          {sameDayClash ? (
            <p className="mb-4 rounded-md border border-action/40 bg-action-soft p-3 text-xs text-action">
              A cutoff and a bill fall on the same day. These are different things: the cutoff is
              the last evidenced time to act, the bill is the expected charge.
            </p>
          ) : null}
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracked events on this day.</p>
          ) : (
            <AgendaList events={selectedEvents} compact />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function AgendaList({
  events,
  heading,
  compact,
}: {
  events: CalendarEvent[];
  heading?: string;
  compact?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events in this range.</p>;
  }
  return (
    <div>
      {heading ? <h3 className="mb-3 text-base">{heading}</h3> : null}
      <ul className="divide-y divide-border">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-1.5">
                <EventMarker type={e.type} estimated={e.estimated} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {e.type === "action"
                    ? "Action cutoff"
                    : e.type === "trial_end"
                      ? "Trial ends"
                      : e.estimated
                        ? "Bills on (estimated)"
                        : "Bills on"}
                  {" — "}
                  <Link
                    to="/subscriptions/$id"
                    params={{ id: e.commitment.id }}
                    className="underline underline-offset-4"
                  >
                    {e.commitment.merchant}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground">{e.description}</p>
                {!compact ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatWeekdayLong(e.date)}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

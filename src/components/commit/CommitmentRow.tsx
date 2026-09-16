import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDayMonth, relativeDayLabel } from "@/lib/commit/dates";
import type { UpcomingItem } from "@/lib/commit/derive";
import { formatMoney } from "@/lib/commit/money";
import { useCommitStore } from "@/lib/commit/store";
import { IntentionBadge, LifecycleBadge, VerificationBadge } from "./badges";

function billLine(item: UpcomingItem) {
  const c = item.commitment;
  if (!c.nextBillDate) {
    return c.lifecycle === "paused"
      ? "No next bill projected while paused — resume rule unknown"
      : "No next bill recorded";
  }
  const amount = formatMoney(c.terms.amountMinor, c.terms.currency);
  const prefix = c.terms.amountMinor === null ? "Amount unknown" : amount;
  return `Bills ${prefix} on ${formatDayMonth(c.nextBillDate)}${c.nextBillEstimated ? " (estimated)" : ""}`;
}

export function CommitmentRow({ item, today }: { item: UpcomingItem; today: string }) {
  const c = item.commitment;
  const { acknowledgeWindow } = useCommitStore();
  const unconfirmed = c.claims.some((cl) => cl.verification === "unconfirmed");

  return (
    <li className="border-t border-border first:border-t-0">
      <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/subscriptions/$id"
              params={{ id: c.id }}
              className="font-display text-xl underline-offset-4 hover:underline"
            >
              {c.merchant}
            </Link>
            <span className="text-sm text-muted-foreground">{c.planNickname}</span>
          </div>

          <p className="mt-1.5 text-sm">
            {item.action.date ? (
              <>
                <span className="font-medium text-action">
                  {item.action.verb} {formatDayMonth(item.action.date)}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  ({relativeDayLabel(item.action.date, today)})
                </span>
              </>
            ) : (
              <span className="font-medium text-action">No action date recorded</span>
            )}
            <span className="text-muted-foreground"> · {billLine(item)}</span>
          </p>

          <p className="mt-1 text-xs text-muted-foreground">{item.action.basis}</p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <IntentionBadge intention={c.intention} />
            <LifecycleBadge lifecycle={c.lifecycle} />
            {unconfirmed ? <VerificationBadge state="unconfirmed" /> : null}
          </div>

          {item.bucket === "passed" ? (
            <p className="mt-3 rounded-md border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
              The recorded cancellation window may have passed. Check your options with the
              provider — Commit cannot confirm what is still possible.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {item.bucket === "passed" ? (
            <Button variant="outline" size="sm" onClick={() => acknowledgeWindow(c.id)}>
              Acknowledge
            </Button>
          ) : null}
          <Button asChild size="sm" variant={item.bucket === "passed" ? "default" : "secondary"}>
            <Link to="/subscriptions/$id" params={{ id: c.id }}>
              {c.intention === "cancel" ? "Cancellation help" : "Decide"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { ArrowUpRight, ChevronLeft, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AppShell, Panel } from "@/components/commit/AppShell";
import {
  ChannelBadge,
  IntentionBadge,
  LifecycleBadge,
  OriginBadge,
  SampleTag,
  VerificationBadge,
} from "@/components/commit/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  describeRecurrence,
  formatLongDate,
  relativeDayLabel,
  todayISO,
} from "@/lib/commit/dates";
import { nextAction, projectedBills, proposeTarget } from "@/lib/commit/derive";
import { formatMoney, monthlyEquivalentMinor } from "@/lib/commit/money";
import { useCommitStore, useToday } from "@/lib/commit/store";
import {
  INTENTION_LABEL,
  ORIGIN_LABEL,
  UNKNOWN_REASON_LABEL,
  WORKFLOW_LABEL,
  type Commitment,
  type Intention,
} from "@/lib/commit/types";

export const Route = createFileRoute("/subscriptions/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Commitment details — Commit` },
      {
        name: "description",
        content: `Terms, provenance, reminders and cancellation guidance for commitment ${params.id}.`,
      },
      { property: "og:title", content: "Commitment details — Commit" },
      {
        property: "og:description",
        content: "Terms provenance, original currency and channel-based cancellation guidance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetailPage,
});

function DetailPage() {
  const { id } = Route.useParams();
  const store = useCommitStore();
  const today = useToday();
  const c = store.get(id);

  if (!c) {
    return (
      <AppShell title="Not found" lede="No commitment with that reference exists in this browser.">
        <Button asChild>
          <Link to="/subscriptions">Back to subscriptions</Link>
        </Button>
      </AppShell>
    );
  }

  const action = nextAction(c, today);
  const monthly = monthlyEquivalentMinor(c.terms);

  return (
    <AppShell
      title={c.merchant}
      lede={`${c.planNickname} · ${c.category}`}
      aside={
        <div className="space-y-5">
          <Panel title="Next action" description={action.basis}>
            {action.date ? (
              <>
                <p className="font-display text-2xl text-action">
                  {action.verb} {formatLongDate(action.date)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {relativeDayLabel(action.date, today)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {c.intention === "keep"
                  ? "You decided to keep this. No decision is scheduled."
                  : "No decision date recorded yet."}
              </p>
            )}
            {action.windowPassed ? (
              <p className="mt-3 flex gap-2 rounded-md border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                The recorded cancellation window may have passed. Check your options with the
                provider.
              </p>
            ) : null}
          </Panel>

          <Panel title="Next bill">
            {c.nextBillDate ? (
              <>
                <p className="font-display text-2xl">
                  {formatMoney(c.terms.amountMinor, c.terms.currency)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bills on {formatLongDate(c.nextBillDate)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.nextBillEstimated
                    ? "Estimated, not confirmed. This has not been paid."
                    : "Confirmed against source evidence."}{" "}
                  Shown in its original currency ({c.terms.currency}); Commit does not convert it.
                </p>
                {monthly !== null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Monthly equivalent {formatMoney(monthly, c.terms.currency)} ·{" "}
                    {describeRecurrence(c.terms.recurrence)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Amount unknown (
                    {UNKNOWN_REASON_LABEL[c.terms.amountUnknownReason ?? "no_evidence"]}), so it is
                    excluded from every total.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {c.cancellation === "confirmed"
                  ? "No future bill projected. Renewal stopped."
                  : "No next bill projected. The resume rule is unknown, so projection is suspended."}
              </p>
            )}
          </Panel>
        </div>
      }
    >
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/subscriptions">
          <ChevronLeft className="size-4" aria-hidden="true" />
          All subscriptions
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap gap-2">
        <IntentionBadge intention={c.intention} />
        <LifecycleBadge lifecycle={c.lifecycle} />
        <ChannelBadge channel={c.channel} />
        {c.sample ? <SampleTag /> : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-5 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="terms">Terms and evidence</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <IntentionControl commitment={c} today={today} />
          <CancellationPlaybook commitment={c} />
          <DateLedger commitment={c} />
        </TabsContent>

        <TabsContent value="terms" className="space-y-6">
          <TermsAndEvidence commitment={c} />
        </TabsContent>

        <TabsContent value="reminders" className="space-y-6">
          <RemindersPreview commitment={c} today={today} />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Panel title="History" description="Corrections are preserved, never rewritten.">
            <ol className="space-y-4">
              {c.history.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-4">
                  <p className="text-sm font-medium">{h.summary}</p>
                  {h.detail ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{h.detail}</p>
                  ) : null}
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {new Date(h.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          {c.termHistory.length ? (
            <Panel
              title="Previous term versions"
              description="Historical bills keep their original price. A revision applies from its effective date forward."
            >
              <ul className="space-y-3 text-sm">
                {c.termHistory.map((t) => (
                  <li key={t.id} className="flex flex-wrap justify-between gap-2">
                    <span className="font-mono">{formatMoney(t.amountMinor, t.currency)}</span>
                    <span className="text-muted-foreground">
                      {formatLongDate(t.effectiveFrom)} →{" "}
                      {t.effectiveTo ? formatLongDate(t.effectiveTo) : "superseded"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ------------------------------------------------------------- intention

function IntentionControl({ commitment: c, today }: { commitment: Commitment; today: string }) {
  const { setIntention, settings } = useCommitStore();
  const [choice, setChoice] = React.useState<Intention>(c.intention);
  const [target, setTarget] = React.useState<string>(c.reviewTargetDate ?? "");
  const [ack, setAck] = React.useState(Boolean(c.lateTargetAcknowledged));

  React.useEffect(() => {
    setChoice(c.intention);
    setTarget(c.reviewTargetDate ?? "");
  }, [c.intention, c.reviewTargetDate]);

  const proposal = proposeTarget(choice, {
    cutoff: c.actionCutoffDate,
    bill: c.nextBillDate,
    trialEnd: c.trialEndDate,
  }, settings);

  const tooLate = Boolean(c.actionCutoffDate && target && target > c.actionCutoffDate);
  const blocked = tooLate && !ack;

  return (
    <Panel
      title="Your intention"
      description="Intention is your plan. It is separate from the lifecycle status and from whether cancellation has actually happened."
    >
      <fieldset>
        <legend className="sr-only">Choose an intention</legend>
        <div className="flex flex-wrap gap-2">
          {(["keep", "review", "cancel"] as Intention[]).map((i) => (
            <Button
              key={i}
              variant={choice === i ? "default" : "outline"}
              aria-pressed={choice === i}
              onClick={() => {
                setChoice(i);
                const p = proposeTarget(i, {
                  cutoff: c.actionCutoffDate,
                  bill: c.nextBillDate,
                  trialEnd: c.trialEndDate,
                }, settings);
                setTarget(p.date ?? "");
              }}
            >
              {INTENTION_LABEL[i]}
            </Button>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 text-xs text-muted-foreground">
        {choice === "keep"
          ? "Keep means deliberate continuation with low-noise reminders. It is a valid outcome, not a failure to cancel."
          : choice === "cancel"
            ? "You plan to cancel. Commit has not canceled anything — you complete it with the provider."
            : "Review means decide by a target date."}
      </p>

      {choice !== "keep" ? (
        <div className="mt-4 max-w-sm">
          <Label htmlFor="target">
            {choice === "cancel" ? "Cancel by" : "Review before"}
          </Label>
          <Input
            id="target"
            type="date"
            className="mt-1.5"
            value={target}
            min={today}
            onChange={(e) => {
              setTarget(e.target.value);
              setAck(false);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Suggested: {proposal.date ? formatLongDate(proposal.date) : "no date can be proposed"} —{" "}
            {proposal.basis}
          </p>
          {c.actionCutoffDate ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Merchant action cutoff: {formatLongDate(c.actionCutoffDate)}.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Cutoff unknown. Commit will not turn that into a confident date.
            </p>
          )}

          {tooLate ? (
            <label className="mt-3 flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(v === true)}
                aria-label="Acknowledge that the target is later than the merchant cutoff"
                className="mt-0.5"
              />
              <span>
                This target falls after the merchant action cutoff. Acting then may be too late. I
                understand and want to keep this date.
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <Button
          disabled={blocked}
          onClick={() => {
            setIntention(c.id, choice, choice === "keep" ? null : target || null, ack);
            toast.success(`Intention saved: ${INTENTION_LABEL[choice]}`, {
              description: "Lifecycle status is unchanged.",
            });
          }}
        >
          Save intention
        </Button>
      </div>
    </Panel>
  );
}

// -------------------------------------------------- cancellation playbook

function CancellationPlaybook({ commitment: c }: { commitment: Commitment }) {
  const { startCancellation, confirmCancellation, reopenCancellation } = useCommitStore();
  const [renewalStop, setRenewalStop] = React.useState(c.renewalStopDate ?? todayISO());
  const [accessEnd, setAccessEnd] = React.useState(c.accessEndDate ?? "");
  const [basis, setBasis] = React.useState(c.cancellationBasis ?? "");
  const [correctionReason, setCorrectionReason] = React.useState("");
  const [correctedBill, setCorrectedBill] = React.useState("");

  const steps =
    c.channel === "apple_app_store"
      ? [
          "On your iPhone or iPad, open Settings and tap your name at the top.",
          "Tap Subscriptions, then choose this subscription.",
          "Tap Cancel Subscription and confirm. On a Mac, use App Store → your name → Account Settings → Manage.",
          "Apple publishes a guideline of cancelling at least 24 hours before a trial or renewal. Treat it as guidance, not a guarantee — verify the current official page.",
        ]
      : c.channel === "web"
        ? [
            "Open the provider's own account or billing page in a new tab.",
            "Find the plan and follow their cancellation flow to the end.",
            "Keep the confirmation screen or email — that is the evidence Commit records.",
            "Return here and confirm what actually happened.",
          ]
        : [
            "First establish who bills you: the provider directly, Apple, Google, or a reseller.",
            "Check a card statement or receipt for the billing descriptor.",
            "Set the purchase channel on this record, then Commit can give you the right path.",
          ];

  return (
    <Panel
      title="Cancellation guidance"
      description={`Workflow status: ${WORKFLOW_LABEL[c.cancellation]}. Commit never cancels on your behalf, handles no passwords, and cannot guarantee a refund.`}
    >
      <p className="mb-4 text-sm">
        {c.channel === "apple_app_store"
          ? "This was purchased through the Apple App Store, so Apple bills you — the provider's own website usually cannot cancel it."
          : c.channel === "web"
            ? "This was purchased on the web, so you cancel with the provider directly."
            : "The purchase channel is unknown, so Commit will not recommend a path yet."}
      </p>

      <ol className="mb-5 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span
              aria-hidden="true"
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[11px]"
            >
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {c.channel === "web" && c.manageUrl ? (
          <Button
            onClick={() => {
              startCancellation(c.id);
              window.open(c.manageUrl, "_blank", "noopener,noreferrer");
              toast("Handed off to the provider", {
                description:
                  "Marked as awaiting your confirmation. Opening a page does not cancel anything.",
              });
            }}
          >
            Start cancellation on {c.merchantDomain}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {c.channel !== "web" ? (
          <Button variant="outline" onClick={() => startCancellation(c.id)}>
            I&apos;ve started cancelling
          </Button>
        ) : null}
      </div>

      {c.cancellation === "awaiting_confirmation" || c.cancellation === "in_progress" ? (
        <div className="mt-5 rounded-md border border-border p-4">
          <h3 className="text-base">Have you completed cancellation?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Reminders stay active until you confirm. Stopping a renewal and losing access are
            separate dates.
          </p>
          <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="renewal-stop">Renewal stops</Label>
              <Input
                id="renewal-stop"
                type="date"
                className="mt-1.5"
                value={renewalStop}
                onChange={(e) => setRenewalStop(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="access-end">Access ends</Label>
              <Input
                id="access-end"
                type="date"
                className="mt-1.5"
                value={accessEnd}
                onChange={(e) => setAccessEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 max-w-md">
            <Label htmlFor="cancellation-basis">How do you know cancellation completed?</Label>
            <Input id="cancellation-basis" value={basis} maxLength={300} placeholder="Confirmation email or provider screen" onChange={(e) => setBasis(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Record the source you checked. Opening a provider page is not enough.</p>
          </div>
          <Button
            className="mt-4"
            disabled={!basis.trim()}
            onClick={() => {
              confirmCancellation(c.id, renewalStop || null, accessEnd || null, basis.trim());
              toast.success("Cancellation confirmed by you", {
                description: "Recorded as your confirmation, not as provider-verified evidence.",
              });
            }}
          >
            Yes, I completed it
          </Button>
        </div>
      ) : null}

      {c.cancellation === "confirmed" ? (
        <div className="mt-5 rounded-md border border-trial/40 bg-trial-soft p-3 text-sm text-trial"><p>
          Cancellation confirmed by you. Renewal stops{" "}
          {c.renewalStopDate ? formatLongDate(c.renewalStopDate) : "on an unrecorded date"}, and
          access continues until{" "}
          {c.accessEndDate ? formatLongDate(c.accessEndDate) : "an unrecorded date"}. Confirmed
          renewal-stop does not erase past payments.
          {c.cancellationBasis ? ` Basis: ${c.cancellationBasis}.` : ""}
        </p><details className="mt-3"><summary className="cursor-pointer underline">Correct this confirmation</summary>
          <div className="mt-3 max-w-md space-y-3"><div><Label htmlFor="correction-reason">Why is it still active?</Label><Input id="correction-reason" value={correctionReason} maxLength={300} onChange={(e) => setCorrectionReason(e.target.value)} /></div>
          <div><Label htmlFor="corrected-bill">Next bill, if known</Label><Input id="corrected-bill" type="date" value={correctedBill} onChange={(e) => setCorrectedBill(e.target.value)} /></div>
          <Button variant="outline" disabled={!correctionReason.trim()} onClick={() => { reopenCancellation(c.id, correctedBill || null, correctionReason.trim()); toast.success("Confirmation corrected"); }}>Record correction</Button></div>
        </details></div>
      ) : null}
    </Panel>
  );
}

// -------------------------------------------------------------- date ledger

function DateLedger({ commitment: c }: { commitment: Commitment }) {
  const rows: [string, string | null, string][] = [
    ["Trial end", c.trialEndDate, "End of free or promotional access."],
    [
      "Merchant action cutoff",
      c.actionCutoffDate,
      c.noticePeriodDays
        ? `Evidenced notice period of ${c.noticePeriodDays} days before renewal.`
        : "The last evidenced time to meet the merchant's cancellation rule.",
    ],
    ["Review target", c.reviewTargetDate, "Your planning date. Commit's suggestion is editable."],
    ["Billing date", c.nextBillDate, "The next expected charge."],
    ["Access end", c.accessEndDate, "When the service actually stops."],
  ];

  return (
    <Panel
      title="Dates"
      description="Five separate fields with separate meanings. Commit never collapses them into one “due date”."
    >
      <dl className="divide-y divide-border">
        {rows.map(([label, value, note]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="text-sm font-medium">{label}</dt>
            <dd>
              <span className="text-sm">
                {value ? formatLongDate(value) : <span className="text-muted-foreground">Unknown</span>}
              </span>
              <p className="text-xs text-muted-foreground">{note}</p>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Stored in the merchant timezone {c.merchantTimezone}. Changing your display timezone cannot
        move a contractual instant.
      </p>
    </Panel>
  );
}

// ------------------------------------------------------------------ terms

function TermsAndEvidence({ commitment: c }: { commitment: Commitment }) {
  return (
    <>
      <Panel title="Current terms">
        <dl className="divide-y divide-border">
          <Row
            label="Recurring amount"
            value={
              c.terms.amountMinor === null
                ? `Unknown — ${UNKNOWN_REASON_LABEL[c.terms.amountUnknownReason ?? "no_evidence"]}`
                : `${formatMoney(c.terms.amountMinor, c.terms.currency)} (${c.terms.currency}, original currency)`
            }
          />
          <Row label="Interval" value={describeRecurrence(c.terms.recurrence)} />
          <Row
            label="Billing anchor"
            value={
              c.terms.recurrence
                ? `${formatLongDate(c.terms.recurrence.anchorDate)} — day-of-month preserved, clamped to the last valid day in shorter months`
                : "No anchor recorded"
            }
          />
          <Row label="Effective from" value={formatLongDate(c.terms.effectiveFrom)} />
        </dl>
        {c.terms.note ? <p className="mt-3 text-xs text-muted-foreground">{c.terms.note}</p> : null}
      </Panel>

      <Panel
        title="Evidence by field"
        description="A source badge alone does not imply correctness. Each field shows where its value came from and whether it is confirmed."
      >
        <ul className="divide-y divide-border">
          {c.claims.map((claim) => (
            <li key={claim.field} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{claim.label}</p>
                <p className="text-sm">
                  {claim.value ?? (
                    <span className="text-muted-foreground">
                      Unknown — {UNKNOWN_REASON_LABEL[claim.unknownReason ?? "no_evidence"]}
                    </span>
                  )}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <OriginBadge origin={claim.origin} />
                <VerificationBadge state={claim.verification} />
              </div>
              {claim.excerpt ? (
                <blockquote className="mt-2 border-l-2 border-action/50 pl-3 text-xs italic text-muted-foreground">
                  {claim.excerpt}
                </blockquote>
              ) : null}
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {ORIGIN_LABEL[claim.origin]} · captured {new Date(claim.capturedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

// -------------------------------------------------------------- reminders

function RemindersPreview({ commitment: c, today }: { commitment: Commitment; today: string }) {
  const { settings, mode } = useCommitStore();
  const emailAvailable = mode === "cloud" && import.meta.env["VITE_COMMIT_EMAIL_AVAILABLE"] === "true";
  const action = nextAction(c, today);
  const bills = projectedBills(c, 4);

  return (
    <>
      <Panel
        title="Scheduled prompts"
        description={emailAvailable && settings.outboundEnabled ? "One optional email is scheduled for the current action target. In-app actions remain visible regardless of delivery." : "In-app action preview. Outbound email is off for this account or installation."}
      >
        {action.date ? (
          <ul className="space-y-3 text-sm">
            <li>
              <strong className="font-medium">{formatLongDate(action.date)}</strong> at{" "}
              {String(settings.deliveryHour).padStart(2, "0")}:00 — “You planned to{" "}
              {c.intention === "cancel" ? "cancel" : "review"} {c.merchant}.”
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {c.intention === "keep"
              ? "Keep has no decision prompt."
              : "No dated action, so no prompt can be scheduled."}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Snoozing a queued email in Settings changes delivery time, never the contractual cutoff.
          Opening cancellation guidance does not confirm completion.
        </p>
      </Panel>

      <Panel title="Projected bills" description="Generated with calendar arithmetic from the billing anchor.">
        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills projected.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {bills.map((d) => (
              <li key={d} className="flex justify-between gap-3">
                <span>{formatLongDate(d)}</span>
                <span className="font-mono text-muted-foreground">
                  {formatMoney(c.terms.amountMinor, c.terms.currency)}
                  {c.nextBillEstimated ? " (estimated)" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, formatLongDate, todayISO } from "@/lib/commit/dates";
import { proposeTarget } from "@/lib/commit/derive";
import { useCommitStore } from "@/lib/commit/store";
import type { Commitment, Intention } from "@/lib/commit/types";

export const Route = createFileRoute("/demo/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout simulation — Commit" },
      {
        name: "description",
        content:
          "A simulated trial checkout showing how Commit would capture the amount, interval, trial end and cancellation cutoff, with the source text beside every field.",
      },
      { property: "og:title", content: "Checkout simulation — Commit" },
      {
        property: "og:description",
        content: "Simulation only: no browser access, no real purchase, no real merchant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckoutDemo,
});

const EXCERPTS: Record<string, string> = {
  amount: "“€18.00 per month after your free trial ends.”",
  interval: "“Billed monthly, on the same day each month.”",
  trialEnd: "“Your 14-day free trial ends on the date shown below.”",
  nextBill: "“First charge on the day after your trial ends.”",
  cutoff: "“Cancel at least 1 day before your trial ends to avoid the charge.”",
};

function CheckoutDemo() {
  const today = todayISO();
  const { add, settings, mode } = useCommitStore();
  const navigate = useNavigate();

  const [captured, setCaptured] = React.useState(false);
  const [asked, setAsked] = React.useState(false);
  const [intention, setIntention] = React.useState<Intention>("review");
  const [scenario, setScenario] = React.useState<"standard" | "unknown" | "failed">("standard");
  const [target, setTarget] = React.useState("");
  const [targetTouched, setTargetTouched] = React.useState(false);
  const [draftSaved, setDraftSaved] = React.useState(false);

  const [amount, setAmount] = React.useState("18.00");
  const [trialEnd, setTrialEnd] = React.useState(addDays(today, 14));
  const [nextBill, setNextBill] = React.useState(addDays(today, 15));
  const [cutoff, setCutoff] = React.useState(addDays(today, 13));

  const effectiveCutoff = scenario === "standard" ? cutoff : null;
  const proposal = proposeTarget(intention, {
    cutoff: effectiveCutoff,
    bill: scenario === "failed" ? null : nextBill,
    trialEnd: scenario === "failed" ? null : trialEnd,
  }, settings);
  const actionTarget = targetTouched ? target || null : proposal.date;

  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("commit.checkout.simulation.draft");
      if (!raw) return;
      const saved = JSON.parse(raw) as { amount: string; trialEnd: string; nextBill: string; cutoff: string; intention: Intention; scenario: "standard" | "unknown" | "failed"; target: string; targetTouched: boolean };
      setAmount(saved.amount);
      setTrialEnd(saved.trialEnd);
      setNextBill(saved.nextBill);
      setCutoff(saved.cutoff);
      setIntention(saved.intention);
      setScenario(saved.scenario);
      setTarget(saved.target);
      setTargetTouched(saved.targetTouched);
      setCaptured(true);
      setDraftSaved(true);
    } catch { /* storage can be unavailable */ }
  }, []);

  function saveDraft() {
    setDraftSaved(true);
    try { window.sessionStorage.setItem("commit.checkout.simulation.draft", JSON.stringify({ amount, trialEnd, nextBill, cutoff, intention, scenario, target, targetTouched })); } catch { /* demo only */ }
    toast("Simulation draft saved", { description: "Only this browser session remembers the draft. No active commitment was created." });
  }

  function addCommitment() {
    if (scenario === "failed") return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !trialEnd || !nextBill || nextBill < trialEnd) {
      toast.error("Check the amount, trial end, and first bill before adding this sample.");
      return;
    }
    if (effectiveCutoff && actionTarget && actionTarget > effectiveCutoff) {
      toast.error("Choose a target on or before the merchant cutoff in this simulation.");
      return;
    }
    const now = new Date().toISOString();
    const c: Commitment = {
      id: `atlas-studio-demo-${Math.random().toString(36).slice(2, 6)}`,
      merchant: "Atlas Studio",
      planNickname: "Pro, 14-day trial",
      category: "Software",
      channel: "web",
      intention,
      lifecycle: "trial",
      cancellation: "not_started",
      terms: {
        id: "t-checkout",
        amountMinor: Math.round(Number(amount) * 100),
        currency: "EUR",
        recurrence: { intervalCount: 1, intervalUnit: "month", anchorDate: nextBill },
        effectiveFrom: today,
        note: "Captured at checkout in the simulation.",
      },
      termHistory: [],
      nextBillDate: nextBill,
      nextBillEstimated: false,
      merchantTimezone: "Europe/Dublin",
      createdAt: now,
      trialEndDate: trialEnd,
      actionCutoffDate: effectiveCutoff,
      reviewTargetDate: intention === "keep" ? null : actionTarget,
      accessEndDate: null,
      renewalStopDate: null,
      noticePeriodDays: null,
      manageUrl: "https://example.com/atlas-studio/billing",
      windowAcknowledged: false,
      lateTargetAcknowledged: false,
      sample: true,
      claims: [
        ...(amount !== "18.00" ? [{
          field: "amount", label: "Recurring amount (original extraction)", value: "€18.00 per month",
          origin: "browser_checkout" as const, capturedAt: now, verification: "unconfirmed" as const,
          excerpt: EXCERPTS["amount"]!,
        }] : []),
        {
          field: "amount",
          label: "Recurring amount",
          value: `€${amount} per month`,
          origin: amount === "18.00" ? "browser_checkout" : "manual",
          capturedAt: now,
          verification: "confirmed",
          excerpt: EXCERPTS["amount"]!,
        },
        ...(trialEnd !== addDays(today, 14) ? [{
          field: "trial_end", label: "Trial end (original extraction)", value: addDays(today, 14),
          origin: "browser_checkout" as const, capturedAt: now, verification: "unconfirmed" as const,
          excerpt: EXCERPTS["trialEnd"]!,
        }] : []),
        {
          field: "trial_end",
          label: "Trial end",
          value: trialEnd,
          origin: trialEnd === addDays(today, 14) ? "browser_checkout" : "manual",
          capturedAt: now,
          verification: "confirmed",
          excerpt: EXCERPTS["trialEnd"]!,
        },
        ...(nextBill !== addDays(today, 15) ? [{
          field: "next_bill", label: "First bill (original extraction)", value: addDays(today, 15),
          origin: "browser_checkout" as const, capturedAt: now, verification: "unconfirmed" as const,
          excerpt: EXCERPTS["nextBill"]!,
        }] : []),
        {
          field: "next_bill", label: "First bill", value: nextBill,
          origin: nextBill === addDays(today, 15) ? "browser_checkout" : "manual",
          capturedAt: now, verification: "confirmed", excerpt: EXCERPTS["nextBill"]!,
        },
        ...(effectiveCutoff && cutoff !== addDays(today, 13) ? [{
          field: "cutoff", label: "Merchant action cutoff (original extraction)", value: addDays(today, 13),
          origin: "browser_checkout" as const, capturedAt: now, verification: "unconfirmed" as const,
          excerpt: EXCERPTS["cutoff"]!,
        }] : []),
        {
          field: "cutoff",
          label: "Merchant action cutoff",
          value: effectiveCutoff,
          origin: !effectiveCutoff || cutoff === addDays(today, 13) ? "browser_checkout" : "manual",
          capturedAt: now,
          verification: effectiveCutoff ? "confirmed" : "unconfirmed",
          excerpt: EXCERPTS["cutoff"]!,
        },
      ],
      history: [
        {
          id: `h-${Math.random().toString(36).slice(2, 8)}`,
          at: now,
          kind: "created",
          summary: "Captured from the checkout simulation",
          detail: "You confirmed that the purchase was completed.",
        },
      ],
    };
    if (mode === "cloud") {
      toast("Simulation complete", { description: "This sample stays out of your private account. Add a real commitment from the Add page." });
      return;
    }
    add(c);
    setDraftSaved(false);
    try { window.sessionStorage.removeItem("commit.checkout.simulation.draft"); } catch { /* demo only */ }
    toast.success("Atlas Studio added", {
      description: "Sample record created from the simulation.",
    });
    void navigate({ to: "/subscriptions/$id", params: { id: c.id } });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-5xl">
        <p className="mb-6 inline-block rounded-full border border-dashed border-warn/60 px-3 py-1 text-xs uppercase tracking-wide text-warn">
          Simulation — no browser access, no real purchase
        </p>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          {/* Fake merchant checkout */}
          <section className="rounded-lg border border-border bg-card p-6">
            <h1 className="font-display text-3xl">Atlas Studio</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pro plan — 14-day free trial. A fictional merchant used only for this demo.
            </p>

            <dl className="mt-6 space-y-2 rule-line text-sm">
              <div className="flex justify-between">
                <dt>Today</dt>
                <dd className="font-mono">€0.00</dd>
              </div>
              <div className="flex justify-between">
                <dt>After the trial</dt>
                <dd className="font-mono">€18.00 / month</dd>
              </div>
              <div className="flex justify-between">
                <dt>Trial ends</dt>
                <dd className="font-mono">{formatLongDate(trialEnd)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>First charge</dt>
                <dd className="font-mono">{formatLongDate(nextBill)}</dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {EXCERPTS["cutoff"]} {EXCERPTS["interval"]}
            </p>

            <Button
              className="mt-6"
              onClick={() => {
                setCaptured(true);
                setAsked(false);
              }}
            >
              Start free trial
            </Button>
          </section>

          {/* Capture popup */}
          <aside
            aria-label="Commit capture"
            className="w-full rounded-lg border border-border bg-sidebar p-5 shadow-lg lg:w-[380px]"
          >
            <p className="font-display text-xl leading-none">Commit</p>
            {draftSaved ? <p className="mt-2 text-xs text-trial">A simulation draft is saved in this browser session. No purchase or subscription was recorded.</p> : null}
            {!captured ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Start the trial on the left and Commit will show what it would have read from this
                page. It never sees a real browser in this demo.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <fieldset>
                  <legend className="text-sm font-medium">Extraction scenario</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["standard", "unknown", "failed"] as const).map((value) => (
                      <Button key={value} type="button" size="sm" variant={scenario === value ? "default" : "outline"} aria-pressed={scenario === value} onClick={() => { setScenario(value); setTargetTouched(false); }}>
                        {value === "standard" ? "Terms found" : value === "unknown" ? "Cutoff missing" : "Extraction failed"}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <p className="text-sm">
                  {scenario === "failed" ? "The simulation could not extract reliable terms. Save a draft or enter the terms manually; unknown dates stay unknown." : "Commit read these terms from the page. Correct anything that looks wrong — your edit wins."}
                </p>

                {scenario !== "failed" ? <>
                <Field
                  id="amount"
                  label="Recurring amount (EUR)"
                  value={amount}
                  onChange={setAmount}
                  excerpt={EXCERPTS["amount"]!}
                />
                <Field
                  id="trial-end"
                  label="Trial ends"
                  type="date"
                  value={trialEnd}
                  onChange={setTrialEnd}
                  excerpt={EXCERPTS["trialEnd"]!}
                />
                <Field
                  id="next-bill"
                  label="First bill"
                  type="date"
                  value={nextBill}
                  onChange={setNextBill}
                  excerpt={EXCERPTS["nextBill"]!}
                />
                </> : null}
                {scenario === "standard" ? <Field
                  id="cutoff"
                  label="Cancel by (merchant cutoff)"
                  type="date"
                  value={cutoff}
                  onChange={setCutoff}
                  excerpt={EXCERPTS["cutoff"]!}
                /> : <p className="rounded-md border border-dashed border-border p-3 text-xs">Merchant cutoff: Not found. This is not a confirmed safe deadline.</p>}

                <fieldset>
                  <legend className="text-sm font-medium">What do you intend to do?</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["keep", "review", "cancel"] as const).map((i) => (
                      <Button
                        key={i}
                        type="button"
                        size="sm"
                        variant={intention === i ? "default" : "outline"}
                        aria-pressed={intention === i}
                        onClick={() => setIntention(i)}
                      >
                        {i === "keep" ? "Keep" : i === "review" ? "Review" : "Cancel"}
                      </Button>
                    ))}
                  </div>
                </fieldset>

                <p className="rounded-md border border-dashed border-border p-3 text-xs leading-relaxed">
                  {actionTarget ? (
                    <>
                      Planning target:{" "}
                      <strong className="font-medium">{formatLongDate(actionTarget)}</strong> —{" "}
                      {proposal.basis}.
                    </>
                  ) : (
                    proposal.basis
                  )}{" "}
                  Buffers are a planning convenience you can change, not the merchant’s deadline.
                </p>

                {intention !== "keep" ? <div><Label htmlFor="demo-target">Edit planning target</Label><Input id="demo-target" type="date" className="mt-1" value={targetTouched ? target : proposal.date ?? ""} onChange={(e) => { setTarget(e.target.value); setTargetTouched(true); }} /></div> : null}
                <p className="rounded-md border border-border p-3 text-xs" aria-live="polite">
                  Preview: {intention === "keep" ? "Keep this plan" : `${intention === "cancel" ? "Plan to cancel" : "Review"} ${actionTarget ? `by ${formatLongDate(actionTarget)}` : "when a date is known"}`} · {scenario === "failed" ? "Bill date and amount unknown" : `Bills EUR ${amount} on ${formatLongDate(nextBill)}`} · Outbound reminders off. {intention === "cancel" ? "You still cancel with the provider." : ""}
                </p>
                <Button type="button" variant="outline" className="w-full" onClick={saveDraft}>Save simulation draft</Button>

                {scenario === "failed" ? <p className="text-xs text-muted-foreground">Extraction failed. Save a simulation draft or use manual entry to continue.</p> : !asked ? (
                  <Button className="w-full" onClick={() => setAsked(true)}>
                    Continue
                  </Button>
                ) : (
                  <div className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">Did you complete this purchase?</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nothing is tracked until you say so.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={addCommitment}>
                        Yes, add it
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAsked(false);
                          setCaptured(false);
                          setDraftSaved(false);
                          try { window.sessionStorage.removeItem("commit.checkout.simulation.draft"); } catch { /* demo only */ }
                          toast("Discarded", { description: "Nothing was added." });
                        }}
                      >
                        No, discard
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  excerpt,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  excerpt: string;
  type?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
      <p className="mt-1 text-xs italic text-muted-foreground">{excerpt}</p>
    </div>
  );
}

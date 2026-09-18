import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatLongDate, todayISO } from "@/lib/commit/dates";
import { proposeTarget } from "@/lib/commit/derive";
import { useCommitStore } from "@/lib/commit/store";
import {
  CHANNEL_LABEL,
  INTENTION_LABEL,
  LIFECYCLE_LABEL,
  type Commitment,
  type Intention,
  type IntervalUnit,
  type Lifecycle,
  type PurchaseChannel,
} from "@/lib/commit/types";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "Add a commitment — Commit" },
      {
        name: "description",
        content:
          "Record a subscription or recurring commitment with its own currency, interval, cutoff and your intention.",
      },
      { property: "og:title", content: "Add a commitment — Commit" },
      {
        property: "og:description",
        content: "Capture a trial or subscription and the decision you intend to make.",
      },
    ],
  }),
  component: AddPage,
});

const CURRENCIES = ["EUR", "GBP", "USD", "CHF", "SEK", "PLN", "CAD", "AUD", "JPY"];

function AddPage() {
  const { add } = useCommitStore();
  const navigate = useNavigate();
  const today = todayISO();

  const [merchant, setMerchant] = React.useState("");
  const [plan, setPlan] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [channel, setChannel] = React.useState<PurchaseChannel>("web");
  const [manageUrl, setManageUrl] = React.useState("");
  const [lifecycle, setLifecycle] = React.useState<Lifecycle>("trial");

  const [amount, setAmount] = React.useState("");
  const [amountUnknown, setAmountUnknown] = React.useState(false);
  const [currency, setCurrency] = React.useState("EUR");
  const [intervalCount, setIntervalCount] = React.useState("1");
  const [intervalUnit, setIntervalUnit] = React.useState<IntervalUnit>("month");

  const [nextBill, setNextBill] = React.useState("");
  const [billEstimated, setBillEstimated] = React.useState(false);
  const [trialEnd, setTrialEnd] = React.useState("");
  const [cutoff, setCutoff] = React.useState("");
  const [noticeDays, setNoticeDays] = React.useState("");

  const [intention, setIntention] = React.useState<Intention>("review");
  const [target, setTarget] = React.useState("");
  const [targetTouched, setTargetTouched] = React.useState(false);
  const [ack, setAck] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const proposal = proposeTarget(intention, {
    cutoff: cutoff || null,
    bill: nextBill || null,
    trialEnd: trialEnd || null,
  });

  // Keep the proposal in the field until the person edits it themselves.
  React.useEffect(() => {
    if (!targetTouched) setTarget(proposal.date ?? "");
  }, [proposal.date, targetTouched]);

  const tooLate = Boolean(cutoff && target && target > cutoff);
  const countInvalid = !/^\d+$/.test(intervalCount) || Number(intervalCount) < 1;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!merchant.trim()) return setError("Enter the merchant name.");
    if (countInvalid) return setError("The interval count must be a whole number of 1 or more.");
    if (!amountUnknown && amount && Number.isNaN(Number(amount)))
      return setError("The price must be a number, or mark it unknown.");
    if (tooLate && !ack)
      return setError("Acknowledge the target falling after the merchant cutoff, or pick an earlier date.");
    setError(null);

    const anchor = nextBill || trialEnd || today;
    const record: Commitment = {
      id: `${merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 6)}`,
      merchant: merchant.trim(),
      merchantDomain: manageUrl ? safeHost(manageUrl) : undefined,
      manageUrl: manageUrl && manageUrl.startsWith("https://") ? manageUrl : undefined,
      planNickname: plan.trim() || "Unnamed plan",
      category: category.trim() || "Uncategorised",
      channel,
      lifecycle,
      intention,
      cancellation: "not_started",
      terms: {
        id: "v1",
        effectiveFrom: today,
        effectiveTo: null,
        amountMinor: amountUnknown || !amount ? null : Math.round(Number(amount) * 100),
        amountUnknownReason: amountUnknown ? "no_evidence" : undefined,
        currency,
        recurrence: {
          intervalCount: Number(intervalCount),
          intervalUnit,
          anchorDate: anchor,
        },
      },
      termHistory: [],
      nextBillDate: nextBill || null,
      nextBillEstimated: billEstimated,
      trialEndDate: trialEnd || null,
      actionCutoffDate: cutoff || null,
      reviewTargetDate: intention === "keep" ? null : target || null,
      lateTargetAcknowledged: ack,
      accessEndDate: null,
      renewalStopDate: null,
      noticePeriodDays: noticeDays ? Number(noticeDays) : null,
      merchantTimezone: "Europe/Dublin",
      claims: [
        {
          field: "amount",
          label: "Recurring amount",
          value: amountUnknown || !amount ? null : `${currency} ${amount}`,
          unknownReason: amountUnknown ? "no_evidence" : undefined,
          origin: "manual",
          capturedAt: new Date().toISOString(),
          verification: "confirmed",
        },
        {
          field: "cutoff",
          label: "Merchant action cutoff",
          value: cutoff ? formatLongDate(cutoff) : null,
          unknownReason: cutoff ? undefined : "no_evidence",
          origin: "manual",
          capturedAt: new Date().toISOString(),
          verification: cutoff ? "confirmed" : "unconfirmed",
        },
      ],
      history: [
        {
          id: "h1",
          at: new Date().toISOString(),
          kind: "created",
          summary: "Added manually",
          detail: `Intention recorded as ${INTENTION_LABEL[intention]}.`,
        },
      ],
      createdAt: new Date().toISOString(),
      sample: false,
    };

    add(record);
    toast.success(`${record.merchant} added`, {
      description:
        intention === "keep"
          ? "Recorded as a deliberate Keep. No decision prompt is scheduled."
          : `${intention === "cancel" ? "Cancel by" : "Review before"} ${target ? formatLongDate(target) : "an unrecorded date"}.`,
    });
    navigate({ to: "/subscriptions/$id", params: { id: record.id } });
  }

  return (
    <AppShell
      title="Add a commitment"
      lede="Record what you actually know. An unknown date stays visibly unknown — Commit will not fill it with a guess."
    >
      <form onSubmit={submit} className="space-y-6" noValidate>
        <Panel title="What is it?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="merchant" label="Merchant" required>
              <Input id="merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={80} />
            </Field>
            <Field id="plan" label="Plan or account nickname">
              <Input id="plan" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={80} />
            </Field>
            <Field id="category" label="Category">
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
            </Field>
            <Field id="channel" label="Purchase channel" hint="This decides which cancellation path Commit can offer.">
              <SelectField
                id="channel"
                value={channel}
                onChange={(v) => setChannel(v as PurchaseChannel)}
                options={Object.entries(CHANNEL_LABEL)}
              />
            </Field>
            <Field id="lifecycle" label="Current status" hint="Status is separate from your intention.">
              <SelectField
                id="lifecycle"
                value={lifecycle}
                onChange={(v) => setLifecycle(v as Lifecycle)}
                options={Object.entries(LIFECYCLE_LABEL)}
              />
            </Field>
            {channel === "web" ? (
              <Field id="manage" label="Provider management page" hint="HTTPS only. Used for the cancellation handoff.">
                <Input
                  id="manage"
                  type="url"
                  placeholder="https://provider.example/account"
                  value={manageUrl}
                  onChange={(e) => setManageUrl(e.target.value)}
                  maxLength={300}
                />
              </Field>
            ) : null}
          </div>
        </Panel>

        <Panel title="Price and recurrence" description="Amounts stay in their original currency. Commit never converts or adds different currencies together.">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field id="amount" label="Price">
              <Input
                id="amount"
                inputMode="decimal"
                disabled={amountUnknown}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="12.00"
              />
            </Field>
            <Field id="currency" label="Currency">
              <SelectField
                id="currency"
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES.map((c) => [c, c] as [string, string])}
              />
            </Field>
            <Field id="interval-count" label="Every">
              <Input
                id="interval-count"
                inputMode="numeric"
                value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
                aria-invalid={countInvalid}
              />
            </Field>
            <Field id="interval-unit" label="Unit">
              <SelectField
                id="interval-unit"
                value={intervalUnit}
                onChange={(v) => setIntervalUnit(v as IntervalUnit)}
                options={[
                  ["day", "days"],
                  ["week", "weeks"],
                  ["month", "months"],
                  ["year", "years"],
                ]}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-start gap-2 text-sm">
            <Checkbox
              checked={amountUnknown}
              onCheckedChange={(v) => setAmountUnknown(v === true)}
              className="mt-0.5"
            />
            <span>
              The amount is unknown or varies
              <span className="block text-xs text-muted-foreground">
                It will be excluded from totals and counted in coverage, never treated as zero.
              </span>
            </span>
          </label>

          {intervalUnit === "week" && Number(intervalCount) === 4 ? (
            <p className="mt-3 rounded-md border border-border p-3 text-xs text-muted-foreground">
              A 4-week cycle produces 13 charges in a 364-day reference year, not 12. Commit
              discloses that convention wherever it shows an annual equivalent.
            </p>
          ) : null}
          {intervalUnit === "month" ? (
            <p className="mt-3 rounded-md border border-border p-3 text-xs text-muted-foreground">
              Monthly cycles use calendar arithmetic and keep the day-of-month anchor: a 31st anchor
              lands on the last valid day of shorter months, then returns to the 31st.
            </p>
          ) : null}
        </Panel>

        <Panel title="Dates" description="Each of these means something different. Leave anything you cannot evidence blank.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="trial-end" label="Trial end" hint="End of free or promotional access.">
              <Input id="trial-end" type="date" value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} />
            </Field>
            <Field id="next-bill" label="Next billing date" hint="The next expected charge.">
              <Input id="next-bill" type="date" value={nextBill} onChange={(e) => setNextBill(e.target.value)} />
            </Field>
            <Field
              id="cutoff"
              label="Merchant action cutoff"
              hint="The last evidenced time to meet their cancellation rule. Leave blank if you do not know."
            >
              <Input id="cutoff" type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
            </Field>
            <Field id="notice" label="Notice period (days)" hint="Only if the merchant states one.">
              <Input
                id="notice"
                inputMode="numeric"
                value={noticeDays}
                onChange={(e) => setNoticeDays(e.target.value)}
                placeholder="30"
              />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <Checkbox
              checked={billEstimated}
              onCheckedChange={(v) => setBillEstimated(v === true)}
              className="mt-0.5"
            />
            <span>
              The billing date or amount is an estimate
              <span className="block text-xs text-muted-foreground">
                Estimated bills are shown dashed and labelled. They are never described as paid.
              </span>
            </span>
          </label>
        </Panel>

        <Panel
          title="Your intention"
          description="Required. This is your plan, not the provider's status — choosing Keep is a valid outcome."
        >
          <fieldset>
            <legend className="sr-only">Intention</legend>
            <div className="flex flex-wrap gap-2">
              {(["keep", "review", "cancel"] as Intention[]).map((i) => (
                <Button
                  key={i}
                  type="button"
                  variant={intention === i ? "default" : "outline"}
                  aria-pressed={intention === i}
                  onClick={() => {
                    setIntention(i);
                    setTargetTouched(false);
                    setAck(false);
                  }}
                >
                  {INTENTION_LABEL[i]}
                </Button>
              ))}
            </div>
          </fieldset>

          {intention !== "keep" ? (
            <div className="mt-4 max-w-sm">
              <Label htmlFor="target">{intention === "cancel" ? "Cancel by" : "Review before"}</Label>
              <Input
                id="target"
                type="date"
                className="mt-1.5"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setTargetTouched(true);
                  setAck(false);
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Suggested {proposal.date ? formatLongDate(proposal.date) : "— no date can be proposed"}
                {proposal.date ? ` — ${proposal.basis}` : `. ${proposal.basis}`} This buffer is a
                provisional default, not a contractual deadline. An earlier date is kept as you set it.
              </p>

              {tooLate ? (
                <label className="mt-3 flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
                  <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                  <span>
                    This target is after the merchant action cutoff of {formatLongDate(cutoff)}.
                    Acting then may be too late. I understand and want to keep this date.
                  </span>
                </label>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Keep records a deliberate decision to continue. No decision prompt will be scheduled.
            </p>
          )}
        </Panel>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/50 bg-warn-soft p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit">Save commitment</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/upcoming" })}>
            Cancel
          </Button>
        </div>
      </form>
    </AppShell>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-action"> *</span> : null}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SelectField({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

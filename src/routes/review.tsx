import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, FileText, Pencil, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { ChannelBadge, SampleTag } from "@/components/commit/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLongDate, todayISO } from "@/lib/commit/dates";
import { proposeTarget } from "@/lib/commit/derive";
import { useCommitStore } from "@/lib/commit/store";
import {
  CANDIDATE_KIND_LABEL,
  candidateToCommitment,
  fieldValue,
  type CandidateField,
  type ReviewCandidate,
} from "@/lib/commit/review";
import { ORIGIN_LABEL, type Intention } from "@/lib/commit/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review inbox — Commit" },
      {
        name: "description",
        content:
          "Review unconfirmed candidates, possible duplicates and term conflicts field by field, beside the source text each claim came from.",
      },
      { property: "og:title", content: "Review inbox — Commit" },
      {
        property: "og:description",
        content: "Accept, edit or reject each extracted claim before anything reaches your inventory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const { reviewCandidates, resolveCandidate, setCandidateField, add, update, get } =
    useCommitStore();
  const unreviewed = reviewCandidates.filter((c) => c.status === "unreviewed");
  const resolved = reviewCandidates.filter((c) => c.status === "resolved");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected =
    reviewCandidates.find((c) => c.id === selectedId) ?? unreviewed[0] ?? reviewCandidates[0] ?? null;

  const [intention, setIntention] = React.useState<Intention>("review");

  function handleAddNew(c: ReviewCandidate) {
    const proposal = proposeTarget(intention, {
      cutoff: fieldValue(c, "cutoff"),
      bill: fieldValue(c, "next_bill"),
      trialEnd: fieldValue(c, "trial_end"),
    });
    add(candidateToCommitment(c, intention, proposal.date));
    resolveCandidate(c.id, "Added to your inventory");
    toast.success(`${c.merchant} added to your inventory`, {
      description: "Only the fields you accepted were recorded.",
    });
  }

  function handleUpdateExisting(c: ReviewCandidate) {
    const id = c.matchedCommitmentId;
    if (!id || !get(id)) return;
    const amount = fieldValue(c, "amount");
    const notice = fieldValue(c, "notice_days");
    const nextBill = fieldValue(c, "next_bill");
    update(id, (existing) => {
      const amountMinor =
        amount === null ? existing.terms.amountMinor : Math.round(Number(amount) * 100);
      const changed = amountMinor !== existing.terms.amountMinor;
      return {
        ...existing,
        terms: changed
          ? {
              ...existing.terms,
              id: `${existing.terms.id}-r`,
              amountMinor,
              effectiveFrom: todayISO(),
              note: `Revised from ${c.sourceLabel}.`,
            }
          : existing.terms,
        termHistory: changed ? [existing.terms, ...existing.termHistory] : existing.termHistory,
        noticePeriodDays: notice === null ? existing.noticePeriodDays : Number(notice),
        nextBillDate: nextBill ?? existing.nextBillDate,
        claims: [
          ...c.fields
            .filter((f) => f.decision !== "rejected")
            .map((f) => ({
              field: f.key,
              label: f.label,
              value: f.value,
              origin: f.decision === "edited" ? ("manual" as const) : f.origin,
              capturedAt: c.capturedAt,
              verification: "confirmed" as const,
              excerpt: f.excerpt,
            })),
          ...existing.claims,
        ],
        history: [
          {
            id: `h-${Math.random().toString(36).slice(2, 8)}`,
            at: new Date().toISOString(),
            kind: "terms_revised" as const,
            summary: `Existing record updated from ${c.sourceLabel}`,
            detail: "You accepted the new values. Your intention and status were left unchanged.",
          },
          ...existing.history,
        ],
      };
    });
    resolveCandidate(c.id, "Existing record updated");
    toast.success("Existing record updated", {
      description: "Your intention, status and dates you set yourself were left alone.",
    });
  }

  return (
    <AppShell
      title="Review inbox"
      lede="Nothing on this page has entered your inventory. Each claim sits beside the source text it came from, and you accept, edit or reject it field by field."
      aside={
        <Panel title="How review works" description="Sample candidates only.">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Unconfirmed candidate</strong> — a
              possible new commitment. Nothing is tracked until you add it.
            </li>
            <li>
              <strong className="font-medium text-foreground">Possible duplicate</strong> — it may
              be a record you already keep. You choose whether to update it or keep both.
            </li>
            <li>
              <strong className="font-medium text-foreground">Term conflict</strong> — a source
              disagrees with the terms on file. Accepting it creates a new term version and keeps
              the old one in history.
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            A rejected field stays unknown. It is never filled in with a guess or a zero.
          </p>
          <div className="mt-4">
            <SampleTag />
          </div>
        </Panel>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        {/* Inbox list */}
        <nav aria-label="Review inbox" className="lg:sticky lg:top-7">
          <h2 className="mb-2 text-sm font-medium">
            Needs review{" "}
            <span className="ml-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {unreviewed.length}
            </span>
          </h2>
          <ul className="space-y-2">
            {unreviewed.length === 0 ? (
              <li className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                The inbox is clear.
              </li>
            ) : null}
            {unreviewed.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-current={selected?.id === c.id ? "true" : undefined}
                  className={cn(
                    "w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-accent",
                    selected?.id === c.id && "border-primary bg-accent",
                  )}
                >
                  <span className="block text-sm font-medium">{c.merchant}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {CANDIDATE_KIND_LABEL[c.kind]} · {c.sourceLabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {resolved.length > 0 ? (
            <>
              <h2 className="mb-2 mt-6 text-sm font-medium">Resolved</h2>
              <ul className="space-y-2">
                {resolved.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className="w-full rounded-md border border-dashed border-border p-3 text-left text-muted-foreground transition-colors hover:bg-accent"
                    >
                      <span className="block text-sm">{c.merchant}</span>
                      <span className="mt-0.5 block text-xs">{c.resolution}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>

        {/* Split-pane review */}
        {selected ? (
          <div className="space-y-5">
            <Panel
              title={selected.merchant}
              description={`${CANDIDATE_KIND_LABEL[selected.kind]} · ${selected.sourceLabel} · captured ${formatLongDate(selected.capturedAt.slice(0, 10))}`}
              actions={<ChannelBadge channel={selected.channel} />}
            >
              {selected.matchReason ? (
                <p className="mb-4 rounded-md border border-warn/40 bg-warn-soft p-3 text-sm text-warn">
                  {selected.matchReason}
                  {selected.matchedCommitmentId && get(selected.matchedCommitmentId) ? (
                    <>
                      {" "}
                      <Link
                        to="/subscriptions/$id"
                        params={{ id: selected.matchedCommitmentId }}
                        className="underline underline-offset-4"
                      >
                        Open the existing record
                      </Link>
                      .
                    </>
                  ) : null}
                </p>
              ) : null}

              <div className="grid gap-5 xl:grid-cols-2">
                {/* Extracted claims */}
                <div>
                  <h3 className="mb-3 text-sm font-medium">Extracted claims</h3>
                  <ul className="space-y-3">
                    {selected.fields.map((f) => (
                      <FieldRow
                        key={f.key}
                        field={f}
                        disabled={selected.status === "resolved"}
                        onChange={(patch) => setCandidateField(selected.id, f.key, patch)}
                      />
                    ))}
                  </ul>
                </div>

                {/* Source excerpt */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <FileText className="size-4" aria-hidden="true" />
                    Source: {selected.sourceLabel}
                  </h3>
                  <div className="rounded-md border border-border bg-muted/40 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                      {selected.sourceExcerpt.join("\n")}
                    </pre>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Synthetic source text for the demo. Commit shows the words a claim came from so
                    you can judge it rather than trust it.
                  </p>
                </div>
              </div>
            </Panel>

            {selected.status === "resolved" ? (
              <Panel>
                <p className="text-sm">
                  Resolved: <strong className="font-medium">{selected.resolution}</strong>
                </p>
              </Panel>
            ) : selected.kind === "new" ? (
              <Panel
                title="Add to your inventory"
                description="Choose what you intend to do. Commit proposes a planning target from your buffers and you can change it later."
              >
                <IntentionPicker value={intention} onChange={setIntention} />
                <TargetExplainer candidate={selected} intention={intention} />
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={() => handleAddNew(selected)}>Add to inventory</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resolveCandidate(selected.id, "Marked as not a subscription");
                      toast("Dismissed", { description: "Nothing was added to your inventory." });
                    }}
                  >
                    Not a subscription
                  </Button>
                </div>
              </Panel>
            ) : (
              <Panel
                title={selected.kind === "duplicate" ? "Resolve the duplicate" : "Resolve the conflict"}
                description="Your intention, status and any date you set yourself are never changed by a resolution."
              >
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => handleUpdateExisting(selected)}>Update existing</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleAddNew(selected);
                    }}
                  >
                    Keep separate
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      resolveCandidate(selected.id, "Marked as not a subscription");
                      toast("Dismissed", { description: "Nothing was added or changed." });
                    }}
                  >
                    Not a subscription
                  </Button>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  “Keep separate” records this as its own commitment and leaves the existing one
                  untouched.
                </p>
              </Panel>
            )}
          </div>
        ) : (
          <Panel>
            <p className="text-sm text-muted-foreground">Nothing to review.</p>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

function FieldRow({
  field,
  disabled,
  onChange,
}: {
  field: CandidateField;
  disabled: boolean;
  onChange: (patch: Partial<Pick<CandidateField, "decision" | "value">>) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const inputType = field.kind === "date" ? "date" : "text";

  const state =
    field.decision === "accepted"
      ? "Accepted"
      : field.decision === "edited"
        ? "Edited by you"
        : field.decision === "rejected"
          ? "Rejected — stays unknown"
          : "Not decided yet";

  return (
    <li
      className={cn(
        "rounded-md border border-border p-3",
        field.decision === "accepted" && "border-trial/50",
        field.decision === "edited" && "border-action/50",
        field.decision === "rejected" && "border-dashed opacity-70",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{field.label}</span>
        <span className="text-xs text-muted-foreground">{state}</span>
      </div>

      {editing ? (
        <div className="mt-2">
          <Label htmlFor={`f-${field.key}`} className="text-xs">
            New value
          </Label>
          <Input
            id={`f-${field.key}`}
            type={inputType}
            defaultValue={field.value ?? ""}
            onBlur={(e) => onChange({ value: e.target.value || null, decision: "edited" })}
            className="mt-1"
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => setEditing(false)}
          >
            Done
          </Button>
        </div>
      ) : (
        <p className="mt-1 font-mono text-sm">
          {field.value ?? <span className="text-warn">Unknown — no value stated</span>}
        </p>
      )}

      {field.currentValue !== undefined ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Currently on file: {field.currentValue ?? "nothing recorded"}
        </p>
      ) : null}

      <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground">{field.excerpt}</p>
      <p className="mt-1 text-xs text-muted-foreground">Source: {ORIGIN_LABEL[field.origin]}</p>

      {!disabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={field.decision === "accepted" ? "default" : "outline"}
            onClick={() => onChange({ decision: "accepted" })}
          >
            <Check className="size-3.5" aria-hidden="true" />
            Accept
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={field.decision === "rejected" ? "default" : "outline"}
            onClick={() => onChange({ decision: "rejected" })}
          >
            <X className="size-3.5" aria-hidden="true" />
            Reject
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function IntentionPicker({
  value,
  onChange,
}: {
  value: Intention;
  onChange: (v: Intention) => void;
}) {
  const options: { id: Intention; label: string; hint: string }[] = [
    { id: "keep", label: "Keep", hint: "No decision is scheduled." },
    { id: "review", label: "Review", hint: "Bring it back before the earliest known date." },
    { id: "cancel", label: "Cancel", hint: "Plan to end it before the cutoff." },
  ];
  return (
    <fieldset>
      <legend className="text-sm font-medium">Your intention</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.id}
            type="button"
            variant={value === o.id ? "default" : "outline"}
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className="flex-col items-start gap-0.5 h-auto py-2"
          >
            <span>{o.label}</span>
            <span className="text-xs font-normal opacity-80">{o.hint}</span>
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function TargetExplainer({
  candidate,
  intention,
}: {
  candidate: ReviewCandidate;
  intention: Intention;
}) {
  const proposal = proposeTarget(intention, {
    cutoff: fieldValue(candidate, "cutoff"),
    bill: fieldValue(candidate, "next_bill"),
    trialEnd: fieldValue(candidate, "trial_end"),
  });
  return (
    <p className="mt-4 rounded-md border border-dashed border-border p-3 text-sm">
      {proposal.date ? (
        <>
          Proposed target: <strong className="font-medium">{formatLongDate(proposal.date)}</strong>{" "}
          — {proposal.basis}.
        </>
      ) : (
        <>No target proposed: {proposal.basis}</>
      )}{" "}
      <span className="text-muted-foreground">
        Buffers are a planning convenience, not the merchant’s deadline.
      </span>
    </p>
  );
}

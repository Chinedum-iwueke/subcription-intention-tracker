import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, FileText, Pencil, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { ChannelBadge, SampleTag } from "@/components/commit/badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, formatLongDate, todayISO } from "@/lib/commit/dates";
import { proposeTarget } from "@/lib/commit/derive";
import { useCommitStore } from "@/lib/commit/store";
import {
  CANDIDATE_KIND_LABEL,
  candidateToCommitment,
  fieldError,
  fieldValue,
  pendingFields,
  type CandidateField,
  type ReviewCandidate,
} from "@/lib/commit/review";
import { ORIGIN_LABEL, type Intention, type OriginType } from "@/lib/commit/types";
import { cn } from "@/lib/utils";
import { getCloudClient } from "@/lib/commit/cloud";

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
  const { commitments, reviewCandidates, resolveCandidate, setCandidateField, addCandidate, acceptCandidate, applyCandidateUpdate, get, settings, mode, reloadCloud } =
    useCommitStore();
  const unreviewed = reviewCandidates.filter((c) => c.status === "unreviewed");
  const resolved = reviewCandidates.filter((c) => c.status === "resolved");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected =
    reviewCandidates.find((c) => c.id === selectedId) ?? unreviewed[0] ?? reviewCandidates[0] ?? null;

  const [intention, setIntention] = React.useState<Intention>("review");
  React.useEffect(() => { setIntention(selected?.intendedIntention ?? 'review'); }, [selected?.id]);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [mobilePane, setMobilePane] = React.useState<"fields" | "evidence">("fields");
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadMerchant, setUploadMerchant] = React.useState("");
  const [uploadCurrency, setUploadCurrency] = React.useState("EUR");
  const [uploadOrigin, setUploadOrigin] = React.useState<"receipt" | "screenshot">("receipt");
  const [retentionDays, setRetentionDays] = React.useState<30 | 90>(30);
  const [requestExtraction, setRequestExtraction] = React.useState(false);
  const [uploadPreview, setUploadPreview] = React.useState<{ id: string; url: string; type: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [parsingId, setParsingId] = React.useState<string | null>(null);
  const cancelledParses = React.useRef(new Set<string>());
  const ocrProcessor = import.meta.env["VITE_COMMIT_OCR_PROCESSOR_NAME"] as string | undefined;
  const ocrRegion = import.meta.env["VITE_COMMIT_OCR_PROCESSOR_REGION"] as string | undefined;
  const ocrAvailable = mode === "cloud" && import.meta.env["VITE_COMMIT_OCR_AVAILABLE"] === "true" && Boolean(ocrProcessor && ocrRegion);

  async function runExtraction(candidateId: string) {
    const client = getCloudClient();
    if (!client) return;
    setParsingId(candidateId);
    const { data, error } = await client.functions.invoke("parse-evidence", { body: { candidateId } });
    await reloadCloud();
    setParsingId(null);
    if (cancelledParses.current.delete(candidateId)) return;
    if (error || data?.error) setReviewError(data?.error ?? error?.message ?? "Extraction failed. Continue by entering terms manually.");
    else toast.success("Extraction ready for review", { description: "Every proposed field still needs your decision." });
  }

  async function cancelExtraction(candidateId: string) {
    const client = getCloudClient();
    if (!client) return;
    const { error } = await client.rpc("cancel_commit_extraction", { p_candidate_id: candidateId });
    if (error) { setReviewError(error.message); return; }
    cancelledParses.current.add(candidateId);
    setParsingId(null);
    await reloadCloud();
    toast("Extraction stopped", { description: "You can review the file manually." });
  }

  React.useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview.url); }, [uploadPreview]);

  React.useEffect(() => {
    if (mode !== "cloud" || !selected?.artifactPath || uploadPreview?.id === selected.id) return;
    const client = getCloudClient();
    if (!client) return;
    let active = true;
    void client.storage.from("commit-evidence").download(selected.artifactPath).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setReviewError("The saved evidence could not be opened. Check your connection and try again."); return; }
      setUploadPreview({ id: selected.id, url: URL.createObjectURL(data), type: data.type });
    });
    return () => { active = false; };
  }, [mode, selected?.id, selected?.artifactPath, uploadPreview?.id]);

  async function addLocalFileCandidate() {
    if (!uploadFile || !uploadMerchant.trim()) {
      setReviewError("Choose a file and enter the merchant name before starting review.");
      return;
    }
    if (!["image/png", "image/jpeg", "application/pdf"].includes(uploadFile.type) || uploadFile.size > 10 * 1024 * 1024) {
      setReviewError("Choose a PNG, JPEG, or PDF no larger than 10 MB.");
      return;
    }
    const id = `file-${crypto.randomUUID()}`;
    const origin: OriginType = uploadOrigin;
    const fieldDefinitions: [string, string, CandidateField["kind"]][] = [
      ["amount", "Recurring amount", "money"], ["interval", "Billing interval", "interval"],
      ["next_bill", "Next bill date", "date"], ["trial_end", "Trial end", "date"],
      ["cutoff", "Merchant action cutoff", "date"],
    ];
    const fields: CandidateField[] = fieldDefinitions.map(([key, label, kind]) => ({
      key, label, kind, extracted: null, value: null,
      excerpt: "No text was extracted. Check the original and enter a value, or leave it unknown.",
      origin, decision: "pending" as const,
    }));
    const possibleMatch = commitments.find((item) => item.merchant.trim().toLocaleLowerCase() === uploadMerchant.trim().toLocaleLowerCase());
    const makeCandidate = (path?: string, sha?: string): ReviewCandidate => ({
      id, kind: possibleMatch ? "duplicate" : "new", merchant: uploadMerchant.trim(), planNickname: "Reviewed from file",
      category: "Uncategorised", channel: "unknown", currency: uploadCurrency,
      sourceLabel: `File: ${uploadFile.name}`, capturedAt: new Date().toISOString(),
      sourceExcerpt: mode === "cloud"
        ? ["Private file saved to your account. Automatic extraction is unavailable; inspect the original and enter each field yourself."]
        : ["The file is previewed in this browser session only. No server upload or OCR occurs."],
      fields, status: "unreviewed", sample: mode === "demo", processingState: ocrAvailable && requestExtraction ? "queued" : "needs_review",
      ...(ocrAvailable && requestExtraction ? { ocrConsentAt: new Date().toISOString(), ocrProcessor: ocrProcessor!, ocrRegion: ocrRegion! } : {}),
      ...(possibleMatch ? { matchedCommitmentId: possibleMatch.id, matchReason: "Same merchant name. Check the plan and account before merging." } : {}),
      ...(path ? { artifactPath: path } : {}), ...(sha ? { artifactSha256: sha } : {}),
    });
    let artifactPath: string | undefined;
    let artifactSha256: string | undefined;
    if (mode === "cloud") {
      const client = getCloudClient();
      if (!client) { setReviewError("Sign in to save private evidence."); return; }
      setUploading(true);
      try {
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError || !auth.user) throw new Error("Your session expired. Sign in again.");
        const hash = await crypto.subtle.digest("SHA-256", await uploadFile.arrayBuffer());
        artifactSha256 = [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join("");
        const existing = await client.from("evidence_artifacts").select("id").eq("sha256", artifactSha256).is("deleted_at", null).limit(1);
        if (existing.error) throw existing.error;
        if (existing.data?.length) throw new Error("This file is already in your evidence library. Open its existing review item instead.");
        artifactPath = `${auth.user.id}/${crypto.randomUUID()}.${uploadFile.type === "application/pdf" ? "pdf" : uploadFile.type === "image/png" ? "png" : "jpg"}`;
        const upload = await client.storage.from("commit-evidence").upload(artifactPath, uploadFile, { contentType: uploadFile.type, upsert: false });
        if (upload.error) throw upload.error;
        const registered = await client.rpc("register_commit_evidence", { p_path: artifactPath, p_sha256: artifactSha256, p_origin: origin,
          p_candidate_id: id, p_candidate_body: makeCandidate(artifactPath, artifactSha256), p_retention_days: retentionDays });
        if (registered.error) {
          await client.storage.from("commit-evidence").remove([artifactPath]);
          throw registered.error;
        }
        await reloadCloud();
        if (ocrAvailable && requestExtraction) void runExtraction(id);
      } catch (error) {
        setReviewError(error instanceof Error ? error.message : "Private upload failed. Try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    if (mode === "demo") addCandidate(makeCandidate());
    setUploadPreview({ id, url: URL.createObjectURL(uploadFile), type: uploadFile.type });
    setSelectedId(id);
    setMobilePane("evidence");
    setUploadFile(null);
    setReviewError(null);
    toast.success("Review started", { description: mode === "cloud" ? "The file is private to your account. Enter the terms you can verify." : "The file stays in this browser session." });
  }

  function canResolve(c: ReviewCandidate): boolean {
    const pending = pendingFields(c);
    const invalid = c.fields.map(fieldError).find(Boolean);
    if (pending.length) {
      setReviewError(`Decide what to do with ${pending.map((f) => f.label).join(", ")} first.`);
      return false;
    }
    if (invalid) {
      setReviewError(invalid);
      return false;
    }
    setReviewError(null);
    return true;
  }

  async function handleAddNew(c: ReviewCandidate) {
    if (c.nonRecurring) {
      setReviewError("This sample is a one-time purchase with no recurring schedule. Dismiss it from the inbox.");
      return;
    }
    if (!canResolve(c)) return;
    const proposal = proposeTarget(intention, {
      cutoff: fieldValue(c, "cutoff"),
      bill: fieldValue(c, "next_bill"),
      trialEnd: fieldValue(c, "trial_end"),
    }, settings);
    try {
      await acceptCandidate(c, candidateToCommitment(c, intention, proposal.date));
      toast.success(`${c.merchant} added to your inventory`, { description: "Only the fields you accepted were recorded." });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not accept the candidate. Try again.");
    }
  }

  async function deletePrivateCandidate(c: ReviewCandidate) {
    if (!c.artifactPath || c.status !== "unreviewed") return;
    const otherReferences = reviewCandidates.some((item) => item.id !== c.id && item.artifactPath === c.artifactPath);
    if (!window.confirm(otherReferences ? "Delete this unreviewed item? The shared private file will stay with its other review items." : "Delete this private file and its unreviewed candidate?")) return;
    const client = getCloudClient();
    if (!client) return;
    if (!otherReferences) {
      const removed = await client.storage.from("commit-evidence").remove([c.artifactPath]);
      if (removed.error) { setReviewError(removed.error.message); return; }
    }
    const deleted = await client.rpc("delete_unreviewed_commit_evidence", { p_path: c.artifactPath, p_candidate_id: c.id });
    if (deleted.error) { setReviewError(deleted.error.message); return; }
    setSelectedId(null);
    await reloadCloud();
    toast.success("Private file deleted");
  }

  async function handleUpdateExisting(c: ReviewCandidate) {
    if (!canResolve(c)) return;
    const id = c.matchedCommitmentId;
    const existing = id ? get(id) : undefined;
    if (!existing) return;
    const amount = fieldValue(c, "amount");
    const notice = fieldValue(c, "notice_days");
    const nextBill = fieldValue(c, "next_bill");
    const cutoff = fieldValue(c, "cutoff");
    const revised = (() => {
      const amountMinor =
        amount === null ? existing.terms.amountMinor : Math.round(Number(amount) * 100);
      const changed = amountMinor !== existing.terms.amountMinor;
      const effectiveFrom = changed && existing.nextBillDate && existing.nextBillDate > todayISO()
        ? existing.nextBillDate : todayISO();
      return {
        ...existing,
        terms: changed
          ? {
              ...existing.terms,
              id: `${existing.terms.id}-r`,
              amountMinor,
              effectiveFrom,
              note: `Revised from ${c.sourceLabel}.`,
            }
          : existing.terms,
        termHistory: changed ? [{ ...existing.terms, effectiveTo: addDays(effectiveFrom, -1) }, ...existing.termHistory] : existing.termHistory,
        noticePeriodDays: notice === null ? existing.noticePeriodDays : Number(notice),
        nextBillDate: nextBill ?? existing.nextBillDate,
        actionCutoffDate: cutoff ?? existing.actionCutoffDate,
        claims: [
          ...c.fields
            .filter((f) => f.decision === "edited" && f.extracted !== null)
            .map((f) => ({
              field: f.key,
              label: `${f.label} (original extraction)`,
              value: f.extracted,
              origin: f.origin,
              capturedAt: c.capturedAt,
              verification: "unconfirmed" as const,
              excerpt: f.excerpt,
            })),
          ...c.fields
            .filter((f) => f.decision === "accepted" || f.decision === "edited")
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
    })();
    try {
      await applyCandidateUpdate(c, revised);
      toast.success("Existing record updated", { description: "Your intention and status were left alone." });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not update the existing record.");
    }
  }

  return (
    <AppShell
      title="Review inbox"
      lede="Nothing on this page has entered your inventory. Each claim sits beside the source text it came from, and you accept, edit or reject it field by field."
      aside={
        <Panel title="How review works" description={mode === "demo" ? "Sample candidates only." : "Your private review inbox."}>
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
          {mode === "demo" ? <div className="mt-4"><SampleTag /></div> : null}
        </Panel>
      }
    >
      <Panel title={mode === "cloud" ? "Review a private file" : "Review a local file"} description={mode === "cloud" ? `Choose a PNG, JPEG, or PDF up to 10 MB. ${ocrAvailable ? "You can request OCR or enter terms yourself." : "Automatic extraction is not configured, so enter the terms yourself."} Redact card and address details first.` : "Prototype: choose a fictional PNG, JPEG, or PDF up to 10 MB. The file stays in this browser session and you enter the terms yourself."}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_7rem]">
          <div><Label htmlFor="review-file">Receipt or screenshot</Label><Input id="review-file" type="file" accept="image/png,image/jpeg,application/pdf" className="mt-1" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></div>
          <div><Label htmlFor="review-merchant">Merchant</Label><Input id="review-merchant" className="mt-1" value={uploadMerchant} onChange={(e) => setUploadMerchant(e.target.value)} /></div>
          <div><Label htmlFor="review-currency">Currency</Label><select id="review-currency" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={uploadCurrency} onChange={(e) => setUploadCurrency(e.target.value)}>{["EUR", "GBP", "USD", "CHF", "SEK", "CAD", "AUD", "JPY"].map((v) => <option key={v}>{v}</option>)}</select></div>
        </div>
        <div className="mt-3 max-w-48"><Label htmlFor="evidence-kind">File type</Label><select id="evidence-kind" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={uploadOrigin} onChange={(e) => setUploadOrigin(e.target.value as "receipt" | "screenshot")}><option value="receipt">Receipt or invoice</option><option value="screenshot">Phone screenshot</option></select></div>
        {mode === "cloud" ? <div className="mt-3 max-w-64"><Label htmlFor="retention-days">Keep the original file for</Label><select id="retention-days" className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value) as 30 | 90)}><option value={30}>30 days</option><option value={90}>90 days</option></select><p className="mt-1 text-xs text-muted-foreground">After that, the file is removed. Reviewed terms and history remain until you delete your account.</p></div> : null}
        {ocrAvailable ? <label className="mt-3 flex max-w-2xl items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={requestExtraction} onCheckedChange={(value) => setRequestExtraction(value === true)} /><span>Send this file to {ocrProcessor} in {ocrRegion} for text extraction. Proposed fields stay unconfirmed until I review them. I can leave this off and enter terms myself.</span></label> : null}
        <Button className="mt-3" type="button" disabled={uploading} onClick={() => void addLocalFileCandidate()}>{uploading ? "Saving private file…" : "Start manual review"}</Button>
      </Panel>
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
              {selected.discoveryConnectionId && (
                <p className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Discovery confidence: {selected.confidence ?? "medium"}. This is a possible recurring commitment, not a confirmed subscription. Bank charges do not establish a merchant cutoff or future bill date; verify the plan and account before accepting.
                </p>
              )}
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

              <div className="mb-4 flex gap-2 xl:hidden" aria-label="Review pane">
                <Button size="sm" variant={mobilePane === "fields" ? "default" : "outline"} onClick={() => setMobilePane("fields")}>Fields</Button>
                <Button size="sm" variant={mobilePane === "evidence" ? "default" : "outline"} onClick={() => setMobilePane("evidence")}>Evidence</Button>
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                {/* Extracted claims */}
                <div className={mobilePane === "evidence" ? "hidden xl:block" : undefined}>
                  <h3 className="mb-3 text-sm font-medium">Fields to review</h3>
                  <ul className="space-y-3">
                    {selected.fields.map((f) => (
                      <FieldRow
                        key={f.key}
                        field={f}
                        disabled={selected.status === "resolved"}
                        onChange={(patch) => { setCandidateField(selected.id, f.key, patch); setReviewError(null); }}
                      />
                    ))}
                  </ul>
                </div>

                {/* Source excerpt */}
                <div className={mobilePane === "fields" ? "hidden xl:block" : undefined}>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <FileText className="size-4" aria-hidden="true" />
                    Source: {selected.sourceLabel}
                  </h3>
                  {uploadPreview?.id === selected.id ? (
                    uploadPreview.type === "application/pdf"
                      ? <iframe title="Local PDF preview" src={uploadPreview.url} className="h-80 w-full rounded-md border border-border" />
                      : <img src={uploadPreview.url} alt="Local receipt or screenshot preview" className="max-h-96 w-full rounded-md border border-border object-contain" />
                  ) : null}
                  <div className="rounded-md border border-border bg-muted/40 p-4">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                      {selected.sourceExcerpt.join("\n")}
                    </pre>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selected.artifactExpiredAt ? "The original private file expired; reviewed terms and history remain." : selected.artifactPath ? "Private evidence from your account. Review the original before confirming any field." : selected.id.startsWith("file-") ? "Local preview is available only until you leave this page." : "Synthetic source text for the demo."}
                  </p>
                </div>
              </div>
            </Panel>

            {reviewError && selected.status === "unreviewed" ? (
              <p role="alert" className="rounded-md border border-warn/50 bg-warn-soft p-3 text-sm text-warn">{reviewError}</p>
            ) : null}

            {mode === "cloud" && selected.artifactPath && selected.status === "unreviewed" && ocrAvailable && selected.ocrConsentAt ? <div className="rounded-md border border-border p-3 text-sm"><p>Extraction: {parsingId === selected.id ? "extracting" : (selected.processingState ?? "needs review").replaceAll("_", " ")}. Every suggested value still needs approval.</p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={parsingId === selected.id || selected.processingState === "extracting"} onClick={() => void runExtraction(selected.id)}>Extract or retry</Button>{parsingId === selected.id || selected.processingState === "extracting" ? <Button size="sm" variant="ghost" onClick={() => void cancelExtraction(selected.id)}>Stop extraction</Button> : null}</div></div> : null}

            {mode === "cloud" && selected.artifactPath && selected.status === "unreviewed" ? <Button variant="ghost" onClick={() => void deletePrivateCandidate(selected)}>Delete private file and review item</Button> : null}

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
                  <Button onClick={() => void handleAddNew(selected)} disabled={selected.nonRecurring}>Add to inventory</Button>
                  {selected.nonRecurring ? <p className="w-full text-xs text-warn">No recurring terms were found. A one-time receipt cannot be added as a subscription.</p> : null}
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
                  <Button onClick={() => void handleUpdateExisting(selected)}>Update existing</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleAddNew(selected);
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
  const { settings } = useCommitStore();
  const proposal = proposeTarget(intention, {
    cutoff: fieldValue(candidate, "cutoff"),
    bill: fieldValue(candidate, "next_bill"),
    trialEnd: fieldValue(candidate, "trial_end"),
  }, settings);
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

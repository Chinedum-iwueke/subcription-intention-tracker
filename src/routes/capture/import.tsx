import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { parseExtensionCapture } from "@/lib/commit/extension-capture";
import { useCommitStore } from "@/lib/commit/store";
import { getCloudClient } from "@/lib/commit/cloud";

export const Route = createFileRoute("/capture/import")({ component: CaptureImport });
const PENDING = "commit.extension.pending-import.v1";

function CaptureImport() {
  const { mode, ready, userEmail, reloadCloud, reviewCandidates, commitments } = useCommitStore();
  const [state, setState] = React.useState<"loading" | "ready" | "done" | "error">("loading");
  const [error, setError] = React.useState("");
  const candidate = React.useRef<ReturnType<typeof parseExtensionCapture> | null>(null);
  const [matchId, setMatchId] = React.useState("");
  React.useEffect(() => {
    if (!ready || state === "done") return;
    try {
      const hash = new URLSearchParams(location.hash.slice(1)).get("payload");
      if (hash) {
        sessionStorage.setItem(PENDING, hash);
        history.replaceState(null, "", "/capture/import");
      }
      const payload = sessionStorage.getItem(PENDING);
      if (!payload || payload.length > 24000) throw new Error("No valid capture was received.");
      candidate.current = parseExtensionCapture(
        JSON.parse(decodeURIComponent(escape(atob(payload)))),
      );
      if (reviewCandidates.some((item) => item.id === candidate.current?.id)) {
        sessionStorage.removeItem(PENDING);
        setState("done");
      } else setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid capture.");
      setState("error");
    }
  }, [ready, reviewCandidates, state]);
  async function importCandidate() {
    if (!candidate.current || mode !== "cloud") return;
    const client = getCloudClient();
    if (!client) return;
    const matched = commitments.find((item) => item.id === matchId);
    const body = matched
      ? {
          ...candidate.current,
          kind: "conflict",
          matchedCommitmentId: matched.id,
          matchReason:
            "You selected this existing commitment for a proposed term change. Confirm each changed field in review.",
          fields: candidate.current.fields.map((field) => ({
            ...field,
            currentValue:
              field.key === "amount"
                ? matched.terms.amountMinor === null
                  ? null
                  : (matched.terms.amountMinor / 100).toFixed(2)
                : field.key === "next_bill"
                  ? matched.nextBillDate
                  : field.key === "trial_end"
                    ? matched.trialEndDate
                    : field.key === "cutoff"
                      ? matched.actionCutoffDate
                      : null,
          })),
        }
      : candidate.current;
    const { error: saveError } = await client.rpc("save_review_candidate", {
      p_id: body.id,
      p_expected_version: 0,
      p_body: body,
    });
    if (saveError) {
      const { data } = await client
        .from("review_candidates")
        .select("id")
        .eq("id", candidate.current.id)
        .maybeSingle();
      if (!data) {
        setError(
          `Sync failed: ${saveError.message}. Your capture remains in the extension draft for retry.`,
        );
        setState("error");
        return;
      }
    }
    await reloadCloud();
    sessionStorage.removeItem(PENDING);
    setState("done");
  }
  return (
    <AppShell
      title="Browser capture"
      lede="Review the purchase terms before they affect your schedule."
    >
      <Panel
        title="Confirmed purchase candidate"
        description="The extension captured local page terms after your click. Every proposed field still needs a decision in your review inbox."
      >
        {state === "loading" && <p>Loading capture…</p>}
        {state === "error" && <p role="alert">{error}</p>}
        {state === "ready" && candidate.current && (
          <div className="space-y-3">
            <p>
              {candidate.current.merchant} · {candidate.current.sourceLabel}
            </p>
            <p className="text-sm text-muted-foreground">
              Unknown dates remain unknown. Confirm the amount, interval and cutoff in review.
            </p>
            {mode === "cloud" && userEmail ? (
              <>
                <label className="block text-sm" htmlFor="existing">
                  Existing commitment, if this proposes changed terms
                </label>
                <select
                  id="existing"
                  className="rounded border p-2"
                  value={matchId}
                  onChange={(event) => setMatchId(event.target.value)}
                >
                  <option value="">New purchase or uncertain match</option>
                  {commitments
                    .filter(
                      (item) =>
                        item.merchant.toLowerCase() === candidate.current?.merchant.toLowerCase(),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.merchant} · {item.planNickname || "No plan name"}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Selecting an existing record proposes a change for review. Its confirmed terms
                  stay as they are until you accept the proposal.
                </p>
                <Button onClick={importCandidate}>Add to review inbox</Button>
              </>
            ) : mode === "cloud" ? (
              <Link to="/auth" search={{ next: "/capture/import" }} className="underline">
                Sign in to import
              </Link>
            ) : (
              <p>
                Configure a Commit cloud project before importing. The extension keeps its local
                draft for 24 hours.
              </p>
            )}
          </div>
        )}
        {state === "done" && (
          <p>Capture is in the review inbox. It has not created an active bill or reminder.</p>
        )}
        <p className="mt-4">
          <Link to="/review" className="underline">
            Open review inbox
          </Link>
        </p>
      </Panel>
    </AppShell>
  );
}

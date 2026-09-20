import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { getCloudClient } from "@/lib/commit/cloud";
import { useCommitStore } from "@/lib/commit/store";

export const Route = createFileRoute("/discovery")({ component: DiscoveryPage });
type Connection = {
  id: string;
  provider: "gmail" | "plaid";
  source_label: string;
  status: string;
  consented_at: string;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
};
type PlaidLink = { open: () => void; destroy?: () => void };
declare global {
  interface Window {
    Plaid?: {
      create: (options: {
        token: string;
        receivedRedirectUri?: string;
        onSuccess: (token: string | null) => void;
        onExit: () => void;
      }) => PlaidLink;
    };
  }
}
const PENDING_LINK = "commit.plaid.pending-link";
async function source(action: string, payload: Record<string, unknown> = {}) {
  const client = getCloudClient();
  if (!client) throw new Error("Sign in first.");
  const { data, error } = await client.functions.invoke("discovery-source", {
    body: { action, ...payload },
  });
  if (error || data?.error)
    throw new Error(data?.error ?? error?.message ?? "Source request failed");
  return data;
}
function loadPlaidScript(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link could not load."));
    document.head.append(script);
  });
}

function DiscoveryPage() {
  const { mode, userEmail, reviewCandidates, reloadCloud } = useCommitStore();
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const gmailAvailable =
    mode === "cloud" && import.meta.env["VITE_COMMIT_GMAIL_AVAILABLE"] === "true";
  const plaidAvailable =
    mode === "cloud" && import.meta.env["VITE_COMMIT_PLAID_AVAILABLE"] === "true";
  const discovered = reviewCandidates.filter((item) =>
    Boolean((item as { discoveryConnectionId?: string }).discoveryConnectionId),
  );
  const refresh = React.useCallback(async () => {
    const client = getCloudClient();
    if (!client || !userEmail) return;
    const { data, error: queryError } = await client.rpc("commit_discovery_status");
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setConnections(data ?? []);
  }, [userEmail]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function gmail() {
    setBusy(true);
    setError("");
    try {
      const result = await source("gmail_start");
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gmail could not connect.");
      setBusy(false);
    }
  }
  const openBank = React.useCallback(
    async (reconnectId?: string, returning = false) => {
      setBusy(true);
      setError("");
      try {
        const saved = returning ? JSON.parse(sessionStorage.getItem(PENDING_LINK) || "null") : null;
        const result =
          saved ||
          (await source(
            reconnectId ? "plaid_reconnect" : "plaid_start",
            reconnectId ? { connectionId: reconnectId } : {},
          ));
        if (!returning) sessionStorage.setItem(PENDING_LINK, JSON.stringify(result));
        await loadPlaidScript();
        if (!window.Plaid) throw new Error("Plaid Link is unavailable.");
        const handler = window.Plaid.create({
          token: result.linkToken,
          ...(returning ? { receivedRedirectUri: window.location.href } : {}),
          onSuccess: (publicToken) => {
            void (async () => {
              try {
                if (result.reconnectId)
                  await source("plaid_refresh", { connectionId: result.reconnectId });
                else if (publicToken) await source("plaid_exchange", { publicToken });
                else throw new Error("Bank did not return a connection token.");
                sessionStorage.removeItem(PENDING_LINK);
                window.history.replaceState(null, "", "/discovery");
                await refresh();
                toast.success("Bank discovery connected");
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Bank connection failed.");
              } finally {
                setBusy(false);
                handler.destroy?.();
              }
            })();
          },
          onExit: () => {
            setBusy(false);
            handler.destroy?.();
          },
        });
        handler.open();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Bank connection failed.");
        setBusy(false);
      }
    },
    [refresh],
  );
  React.useEffect(() => {
    if (
      !plaidAvailable ||
      !userEmail ||
      !new URLSearchParams(window.location.search).has("oauth_state_id")
    )
      return;
    if (!sessionStorage.getItem(PENDING_LINK)) {
      setError(
        "Bank authorization returned without the original session. Reconnect from this page.",
      );
      return;
    }
    void openBank(undefined, true);
  }, [plaidAvailable, userEmail, openBank]);
  async function disconnect(connection: Connection) {
    setBusy(true);
    setError("");
    try {
      const result = await source("disconnect", { connectionId: connection.id });
      await refresh();
      if (!result.providerRevoked)
        setError(
          "Ingestion stopped. Provider revocation needs an operator retry; use Disconnect again.",
        );
      else toast.success("Source disconnected");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }
  async function removeFindings(connection: Connection) {
    if (
      !window.confirm(
        "Remove unreviewed findings and observed transaction history from this disconnected source? Confirmed commitments stay in your inventory.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await source("remove_findings", { connectionId: connection.id });
      await reloadCloud();
      toast.success("Unreviewed source findings removed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove findings.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell
      title="Discover commitments"
      lede="Optional sources suggest possible subscriptions. Nothing enters your inventory until you review it."
    >
      <div className="space-y-6">
        <Panel
          title="Gmail"
          description="Look for recent subscription, renewal and trial messages in a mailbox you explicitly connect."
        >
          <p className="text-sm text-muted-foreground">
            Commit requests Gmail read-only access. The source worker scans matching recent
            messages, keeps short relevant excerpts, and discards full message bodies. It does not
            send email or ingest unrelated messages into your inventory. Gmail read-only is a
            restricted Google scope; connection stays unavailable until provider verification and
            security review are complete.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Short excerpts in unreviewed findings can be removed after disconnect. Accepted terms
            and history remain until account deletion. Disconnect revokes access and stops new
            scans; manual capture remains available.
          </p>
          <Button className="mt-3" disabled={!gmailAvailable || !userEmail || busy} onClick={gmail}>
            Connect Gmail
          </Button>
          {!gmailAvailable && (
            <p className="mt-2 text-xs text-muted-foreground">
              Unavailable in this installation. Manual entry and receipt review still work.
            </p>
          )}
        </Panel>
        <Panel
          title="Read-only bank transactions"
          description="Observed charges can suggest recurring patterns, not contractual terms."
        >
          <p className="text-sm text-muted-foreground">
            Plaid Link requests Transactions access only. Supported countries and institutions
            depend on the configured partner account and are shown during connection. Commit groups
            posted charges by merchant, currency and account. Variable amounts stay unknown; no
            transaction creates a cancellation cutoff or confirms a subscription. Consent expiry
            requires reconnection.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Observed charges and unreviewed findings can be removed after disconnect. Accepted terms
            and history remain until account deletion. Disconnect stops ingestion and asks Plaid to
            remove the bank Item; your core Commit records remain usable.
          </p>
          <Button
            className="mt-3"
            disabled={!plaidAvailable || !userEmail || busy}
            onClick={() => void openBank()}
          >
            Connect bank
          </Button>
          {!plaidAvailable && (
            <p className="mt-2 text-xs text-muted-foreground">
              Unavailable until a qualified partner, region, privacy and cost review, and staging
              tests are complete.
            </p>
          )}
        </Panel>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Panel
          title="Connections"
          description="Disconnect stops new ingestion. Existing review candidates stay until you dismiss them; confirmed commitments stay in your inventory."
        >
          {connections.length ? (
            <div className="space-y-3">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"
                >
                  <div>
                    <strong>
                      {connection.provider === "gmail"
                        ? `Gmail · ${connection.source_label}`
                        : connection.source_label}
                    </strong>
                    <p>
                      Status: {connection.status}. Last scan:{" "}
                      {connection.last_synced_at
                        ? new Date(connection.last_synced_at).toLocaleString()
                        : "not yet scanned"}
                      .
                    </p>
                    <p>
                      Consent expires:{" "}
                      {connection.consent_expires_at
                        ? new Date(connection.consent_expires_at).toLocaleString()
                        : "not supplied by provider"}
                      .
                    </p>
                    {connection.last_error && (
                      <p className="text-destructive">{connection.last_error}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {connection.provider === "plaid" &&
                      ["expired", "needs_reconnect"].includes(connection.status) && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void openBank(connection.id)}
                        >
                          Reconnect
                        </Button>
                      )}
                    <Button
                      variant="outline"
                      disabled={
                        busy || (connection.status === "disconnected" && !connection.last_error)
                      }
                      onClick={() => void disconnect(connection)}
                    >
                      Disconnect
                    </Button>
                    {connection.status === "disconnected" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void removeFindings(connection)}
                      >
                        Remove findings
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sources connected.</p>
          )}
        </Panel>
        <Panel
          title="Findings"
          description="Every proposed field has a source excerpt and remains unconfirmed until you decide."
        >
          <p className="text-sm">
            {discovered.filter((item) => item.status === "unreviewed").length} findings need review.{" "}
            <Link to="/review" className="underline">
              Open review inbox
            </Link>
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}

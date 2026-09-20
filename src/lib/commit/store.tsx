import * as React from "react";

import { buildSampleCommitments } from "./fixtures";
import { buildSampleCandidates, type CandidateField, type ReviewCandidate } from "./review";
import { todayISO } from "./dates";
import type { Commitment, Intention, Lifecycle } from "./types";
import { cloudConfigured, getCloudClient } from "./cloud";

const STORAGE_KEY = "commit.phase2.state.v1";

export interface Settings {
  timezone: string;
  locale: string;
  reviewBufferDays: number;
  cancelBufferCutoffDays: number;
  cancelBufferBillDays: number;
  outboundEnabled: boolean;
  outboundConsentAt?: string | null;
  pushEnabled?: boolean;
  pushConsentAt?: string | null;
  deliveryHour: number;
  quietHours: boolean;
  privacyMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: "Europe/Dublin",
  locale: "en-IE",
  reviewBufferDays: 3,
  cancelBufferCutoffDays: 2,
  cancelBufferBillDays: 3,
  outboundEnabled: false,
  outboundConsentAt: null,
  pushEnabled: false,
  pushConsentAt: null,
  deliveryHour: 9,
  quietHours: true,
  privacyMode: false,
};

interface State {
  commitments: Commitment[];
  settings: Settings;
  reviewCandidates: ReviewCandidate[];
}

interface StoreValue extends State {
  ready: boolean;
  mode: "demo" | "cloud";
  userEmail: string | null;
  syncError: string | null;
  conflict: { kind: string; id: string; remote: unknown; local: unknown } | null;
  reloadCloud: () => Promise<void>;
  retryCloud: () => void;
  get: (id: string) => Commitment | undefined;
  update: (id: string, fn: (c: Commitment) => Commitment) => void;
  add: (c: Commitment) => void;
  setIntention: (id: string, intention: Intention, target: string | null, lateAck?: boolean) => void;
  setLifecycle: (id: string, lifecycle: Lifecycle) => void;
  acknowledgeWindow: (id: string) => void;
  startCancellation: (id: string) => void;
  confirmCancellation: (id: string, renewalStop: string | null, accessEnd: string | null, basis: string) => void;
  reopenCancellation: (id: string, nextBill: string | null, reason: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  resetDemo: () => void;
  unreviewedCount: number;
  addCandidate: (candidate: ReviewCandidate) => void;
  acceptCandidate: (candidate: ReviewCandidate, commitment: Commitment) => Promise<void>;
  applyCandidateUpdate: (candidate: ReviewCandidate, commitment: Commitment) => Promise<void>;
  setCandidateField: (
    candidateId: string,
    key: string,
    patch: Partial<Pick<CandidateField, "decision" | "value">>,
  ) => void;
  resolveCandidate: (candidateId: string, resolution: string) => void;
}

const StoreContext = React.createContext<StoreValue | null>(null);

function initialState(): State {
  return {
    commitments: buildSampleCommitments(),
    settings: DEFAULT_SETTINGS,
    reviewCandidates: buildSampleCandidates(),
  };
}

function entry(kind: Commitment["history"][number]["kind"], summary: string, detail?: string) {
  return {
    id: `h-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    kind,
    summary,
    detail,
  };
}

export function CommitStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>(() => cloudConfigured ? { commitments: [], settings: DEFAULT_SETTINGS, reviewCandidates: [] } : initialState());
  const [ready, setReady] = React.useState(false);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<StoreValue["conflict"]>(null);
  const versions = React.useRef({ commitments: new Map<string, number>(), candidates: new Map<string, number>(), profile: 0 });
  const saved = React.useRef({ commitments: new Map<string, string>(), candidates: new Map<string, string>(), profile: "" });
  const queue = React.useRef<Promise<void>>(Promise.resolve());

  const reloadCloud = React.useCallback(async () => {
    const client = getCloudClient();
    if (!client) return;
    const [{ data: commitments, error: ce }, { data: candidates, error: re }, { data: profiles, error: pe }] = await Promise.all([
      client.from("commitments").select("id,version,body"),
      client.from("review_candidates").select("id,version,body"),
      client.from("commit_profiles").select("version,settings").maybeSingle(),
    ]);
    if (ce || re || pe) {
      setSyncError(ce?.message || re?.message || pe?.message || "Could not load account data.");
      return;
    }
    const next: State = {
      commitments: (commitments ?? []).map((row) => row.body as Commitment),
      reviewCandidates: (candidates ?? []).map((row) => row.body as ReviewCandidate),
      settings: { ...DEFAULT_SETTINGS, ...(profiles?.settings as Partial<Settings> | undefined) },
    };
    versions.current = {
      commitments: new Map((commitments ?? []).map((row) => [row.id, row.version])),
      candidates: new Map((candidates ?? []).map((row) => [row.id, row.version])),
      profile: profiles?.version ?? 0,
    };
    saved.current = {
      commitments: new Map(next.commitments.map((item) => [item.id, JSON.stringify(item)])),
      candidates: new Map(next.reviewCandidates.map((item) => [item.id, JSON.stringify(item)])),
      profile: JSON.stringify(next.settings),
    };
    setState(next);
    setSyncError(null);
    setConflict(null);
    setReady(true);
  }, []);

  // Hydrate from localStorage after mount so SSR and first paint match.
  React.useEffect(() => {
    if (cloudConfigured) {
      const client = getCloudClient();
      if (!client) return undefined;
      void client.auth.getUser().then(({ data, error }) => {
        setUserEmail(data.user?.email ?? null);
        if (error || !data.user) setReady(true);
        else void reloadCloud();
      });
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        setUserEmail(session?.user.email ?? null);
        if (event === "SIGNED_OUT") {
          setState({ commitments: [], settings: DEFAULT_SETTINGS, reviewCandidates: [] });
          setReady(true);
        }
        if (event === "SIGNED_IN") {
          setReady(false);
          void reloadCloud();
        }
      });
      return () => listener.subscription.unsubscribe();
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (Array.isArray(parsed?.commitments)) {
          const savedCandidates = Array.isArray(parsed.reviewCandidates) ? parsed.reviewCandidates : [];
          const missingFixtures = buildSampleCandidates().filter(
            (candidate) => !savedCandidates.some((saved) => saved.id === candidate.id),
          );
          setState({
            commitments: parsed.commitments,
            settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
            reviewCandidates: [...savedCandidates, ...missingFixtures],
          });
        }
      }
    } catch {
      /* ignore corrupt local state */
    }
    setReady(true);
    return undefined;
  }, [reloadCloud]);

  React.useEffect(() => {
    if (!ready || cloudConfigured) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  }, [state, ready]);

  React.useEffect(() => {
    if (!cloudConfigured || !ready || !userEmail) return;
    const client = getCloudClient();
    if (!client) return;
    const writes: Array<{ kind: "commitment" | "candidate" | "profile"; id: string; run: () => Promise<void> }> = [];
    for (const item of state.commitments) {
      const body = JSON.stringify(item);
      if (saved.current.commitments.get(item.id) === body) continue;
      if (item.sample) { setSyncError("Sample records cannot enter a live account."); continue; }
      saved.current.commitments.set(item.id, body);
      writes.push({ kind: "commitment", id: item.id, run: async () => {
        const { data, error } = await client.rpc("save_commitment", { p_id: item.id, p_expected_version: versions.current.commitments.get(item.id) ?? 0, p_body: item });
        if (error) {
          if (error.code === "P0001") {
            const remote = await client.from("commitments").select("body").eq("id", item.id).maybeSingle();
            setConflict({ kind: "commitment", id: item.id, remote: remote.data?.body ?? null, local: item });
          }
          throw error;
        }
        versions.current.commitments.set(item.id, data as number);
      } });
    }
    for (const item of state.reviewCandidates) {
      const body = JSON.stringify(item);
      if (saved.current.candidates.get(item.id) === body) continue;
      saved.current.candidates.set(item.id, body);
      writes.push({ kind: "candidate", id: item.id, run: async () => {
        const { data, error } = await client.rpc("save_review_candidate", { p_id: item.id, p_expected_version: versions.current.candidates.get(item.id) ?? 0, p_body: item });
        if (error) {
          if (error.code === "P0001") {
            const remote = await client.from("review_candidates").select("body").eq("id", item.id).maybeSingle();
            setConflict({ kind: "review candidate", id: item.id, remote: remote.data?.body ?? null, local: item });
          }
          throw error;
        }
        versions.current.candidates.set(item.id, data as number);
      } });
    }
    const profile = JSON.stringify(state.settings);
    if (saved.current.profile !== profile) {
      saved.current.profile = profile;
      writes.push({ kind: "profile", id: "profile", run: async () => {
        const { data, error } = await client.rpc("save_commit_profile", { p_expected_version: versions.current.profile, p_settings: state.settings });
        if (error) {
          if (error.code === "P0001") {
            const remote = await client.from("commit_profiles").select("settings").maybeSingle();
            setConflict({ kind: "settings", id: "profile", remote: remote.data?.settings ?? null, local: state.settings });
          }
          throw error;
        }
        versions.current.profile = data as number;
      } });
    }
    if (!writes.length) return;
    queue.current = queue.current.then(async () => {
      for (let index = 0; index < writes.length; index += 1) {
        const write = writes[index]!;
        try { await write.run(); setSyncError(null); }
        catch (error) {
          for (const pending of writes.slice(index)) {
            if (pending.kind === "commitment") saved.current.commitments.delete(pending.id);
            else if (pending.kind === "candidate") saved.current.candidates.delete(pending.id);
            else saved.current.profile = "";
          }
          setSyncError(error instanceof Error ? `${error.message} Your local edit is retained on this page. Export it before reloading.` : "Save failed. Your local edit is retained on this page.");
          break;
        }
      }
    });
  }, [state, ready, userEmail]);

  const value = React.useMemo<StoreValue>(() => {
    const update: StoreValue["update"] = (id, fn) =>
      setState((s) => ({
        ...s,
        commitments: s.commitments.map((c) => (c.id === id ? fn(c) : c)),
      }));

    return {
      ...state,
      ready,
      mode: cloudConfigured ? "cloud" : "demo",
      userEmail,
      syncError,
      conflict,
      reloadCloud,
      retryCloud: () => setState((current) => ({ ...current })),
      get: (id) => state.commitments.find((c) => c.id === id),
      update,
      add: (c) => setState((s) => ({ ...s, commitments: [c, ...s.commitments] })),
      setIntention: (id, intention, target, lateAck) =>
        update(id, (c) => ({
          ...c,
          intention,
          reviewTargetDate: target,
          lateTargetAcknowledged: lateAck ?? false,
          windowAcknowledged: false,
          history: [
            entry(
              "intention_changed",
              `Intention changed from ${c.intention} to ${intention}`,
              target ? `Target set to ${target}.` : "No target date recorded.",
            ),
            ...c.history,
          ],
        })),
      setLifecycle: (id, lifecycle) =>
        update(id, (c) => ({
          ...c,
          lifecycle,
          history: [
            entry("manual_correction", `Lifecycle changed from ${c.lifecycle} to ${lifecycle}`),
            ...c.history,
          ],
        })),
      acknowledgeWindow: (id) =>
        update(id, (c) => ({
          ...c,
          windowAcknowledged: true,
          history: [
            entry(
              "window_acknowledged",
              "You acknowledged that the recorded window may have passed",
            ),
            ...c.history,
          ],
        })),
      startCancellation: (id) =>
        update(id, (c) => ({
          ...c,
          cancellation: c.cancellation === "confirmed" ? c.cancellation : "awaiting_confirmation",
          history: [
            entry(
              "assistance_opened",
              "Cancellation assistance opened",
              "Commit has not canceled anything. This only records that you started.",
            ),
            ...c.history,
          ],
        })),
      confirmCancellation: (id, renewalStop, accessEnd, basis) =>
        update(id, (c) => ({
          ...c,
          cancellation: "confirmed",
          renewalStopDate: renewalStop,
          accessEndDate: accessEnd,
          cancellationBasis: basis,
          nextBillDate: null,
          history: [
            entry(
              "cancellation_confirmed",
              "Cancellation confirmed by you",
              `Basis: ${basis}. Renewal stops ${renewalStop ?? "on an unrecorded date"}. Access ends ${accessEnd ?? "on an unrecorded date"}.`,
            ),
            ...c.history,
          ],
        })),
      reopenCancellation: (id, nextBill, reason) =>
        update(id, (c) => ({
          ...c,
          cancellation: "not_started",
          lifecycle: c.lifecycle === "canceled" ? "active" : c.lifecycle,
          renewalStopDate: null,
          accessEndDate: null,
          cancellationBasis: undefined,
          nextBillDate: nextBill,
          nextBillEstimated: true,
          history: [entry("manual_correction", "Cancellation confirmation corrected", `${reason}. Previous confirmation remains in history. Next bill ${nextBill ?? "unknown"}.`), ...c.history],
        })),
      setSettings: (s) => setState((prev) => ({ ...prev, settings: { ...prev.settings, ...s } })),
      resetDemo: () => { if (!cloudConfigured) setState(initialState()); },
      unreviewedCount: state.reviewCandidates.filter((c) => c.status === "unreviewed").length,
      addCandidate: (candidate) =>
        setState((s) => ({ ...s, reviewCandidates: [candidate, ...s.reviewCandidates] })),
      acceptCandidate: async (candidate, commitment) => {
        const resolved = { ...candidate, status: "resolved" as const, resolution: "Added to your inventory", processingState: "completed" as const };
        if (cloudConfigured) {
          const client = getCloudClient();
          if (!client) throw new Error("Account is unavailable.");
          await queue.current;
          const expected = versions.current.candidates.get(candidate.id);
          if (!expected) throw new Error("The review candidate has not finished saving. Try again shortly.");
          const { error } = await client.rpc("accept_commit_candidate", {
            p_candidate_id: candidate.id, p_expected_candidate_version: expected,
            p_candidate_body: resolved, p_commitment_id: commitment.id, p_commitment_body: commitment,
          });
          if (error) throw error;
          await reloadCloud();
          return;
        }
        setState((s) => ({ ...s, commitments: [commitment, ...s.commitments], reviewCandidates: s.reviewCandidates.map((c) => c.id === candidate.id ? resolved : c) }));
      },
      applyCandidateUpdate: async (candidate, commitment) => {
        const resolved = { ...candidate, status: "resolved" as const, resolution: "Existing record updated", processingState: "completed" as const };
        if (cloudConfigured) {
          const client = getCloudClient();
          if (!client) throw new Error("Account is unavailable.");
          await queue.current;
          const candidateVersion = versions.current.candidates.get(candidate.id);
          const commitmentVersion = versions.current.commitments.get(commitment.id);
          if (!candidateVersion || !commitmentVersion) throw new Error("The current edits have not finished saving. Try again shortly.");
          const { error } = await client.rpc("apply_commit_candidate_update", {
            p_candidate_id: candidate.id, p_candidate_version: candidateVersion, p_candidate_body: resolved,
            p_commitment_id: commitment.id, p_commitment_version: commitmentVersion, p_commitment_body: commitment,
          });
          if (error) throw error;
          await reloadCloud();
          return;
        }
        setState((s) => ({ ...s, commitments: s.commitments.map((item) => item.id === commitment.id ? commitment : item),
          reviewCandidates: s.reviewCandidates.map((item) => item.id === candidate.id ? resolved : item) }));
      },
      setCandidateField: (candidateId, key, patch) =>
        setState((s) => ({
          ...s,
          reviewCandidates: s.reviewCandidates.map((c) =>
            c.id === candidateId
              ? {
                  ...c,
                  fields: c.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
                }
              : c,
          ),
        })),
      resolveCandidate: (candidateId, resolution) =>
        setState((s) => ({
          ...s,
          reviewCandidates: s.reviewCandidates.map((c) =>
            c.id === candidateId ? { ...c, status: "resolved" as const, resolution } : c,
          ),
        })),
    };
  }, [state, ready, userEmail, syncError, conflict, reloadCloud]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCommitStore(): StoreValue {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useCommitStore must be used inside CommitStoreProvider");
  return ctx;
}

export function useToday(): string {
  const [today, setToday] = React.useState(() => todayISO());
  React.useEffect(() => {
    setToday(todayISO());
  }, []);
  return today;
}

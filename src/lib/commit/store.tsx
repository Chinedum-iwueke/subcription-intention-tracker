import * as React from "react";

import { buildSampleCommitments } from "./fixtures";
import { buildSampleCandidates, type CandidateField, type ReviewCandidate } from "./review";
import { todayISO } from "./dates";
import type { Commitment, Intention, Lifecycle } from "./types";

const STORAGE_KEY = "commit.phase2.state.v1";

export interface Settings {
  timezone: string;
  locale: string;
  reviewBufferDays: number;
  cancelBufferCutoffDays: number;
  cancelBufferBillDays: number;
  outboundEnabled: boolean;
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
  get: (id: string) => Commitment | undefined;
  update: (id: string, fn: (c: Commitment) => Commitment) => void;
  add: (c: Commitment) => void;
  setIntention: (id: string, intention: Intention, target: string | null, lateAck?: boolean) => void;
  setLifecycle: (id: string, lifecycle: Lifecycle) => void;
  acknowledgeWindow: (id: string) => void;
  startCancellation: (id: string) => void;
  confirmCancellation: (id: string, renewalStop: string | null, accessEnd: string | null) => void;
  setSettings: (s: Partial<Settings>) => void;
  resetDemo: () => void;
  unreviewedCount: number;
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
  const [state, setState] = React.useState<State>(initialState);
  const [ready, setReady] = React.useState(false);

  // Hydrate from localStorage after mount so SSR and first paint match.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (parsed?.commitments?.length) {
          setState({
            commitments: parsed.commitments,
            settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          });
        }
      }
    } catch {
      /* ignore corrupt local state */
    }
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  }, [state, ready]);

  const value = React.useMemo<StoreValue>(() => {
    const update: StoreValue["update"] = (id, fn) =>
      setState((s) => ({
        ...s,
        commitments: s.commitments.map((c) => (c.id === id ? fn(c) : c)),
      }));

    return {
      ...state,
      ready,
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
      confirmCancellation: (id, renewalStop, accessEnd) =>
        update(id, (c) => ({
          ...c,
          cancellation: "confirmed",
          renewalStopDate: renewalStop,
          accessEndDate: accessEnd,
          nextBillDate: null,
          history: [
            entry(
              "cancellation_confirmed",
              "Cancellation confirmed by you",
              `Renewal stops ${renewalStop ?? "on an unrecorded date"}. Access ends ${accessEnd ?? "on an unrecorded date"}.`,
            ),
            ...c.history,
          ],
        })),
      setSettings: (s) => setState((prev) => ({ ...prev, settings: { ...prev.settings, ...s } })),
      resetDemo: () => setState(initialState()),
    };
  }, [state, ready]);

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

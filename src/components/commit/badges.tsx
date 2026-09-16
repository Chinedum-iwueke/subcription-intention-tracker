import { cn } from "@/lib/utils";
import {
  CHANNEL_LABEL,
  INTENTION_LABEL,
  LIFECYCLE_LABEL,
  ORIGIN_LABEL,
  type Intention,
  type Lifecycle,
  type OriginType,
  type PurchaseChannel,
  type Verification,
} from "@/lib/commit/types";
import { Apple, CircleDashed, CircleDot, Globe, HelpCircle, Smartphone } from "lucide-react";

const base =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap";

export function IntentionBadge({ intention }: { intention: Intention }) {
  const styles: Record<Intention, string> = {
    keep: "border-trial/40 bg-trial-soft text-trial",
    review: "border-action/40 bg-action-soft text-action",
    cancel: "border-warn/40 bg-warn-soft text-warn",
  };
  const glyph: Record<Intention, string> = { keep: "◆", review: "◇", cancel: "✕" };
  return (
    <span className={cn(base, styles[intention])}>
      <span aria-hidden="true">{glyph[intention]}</span>
      Intention: {INTENTION_LABEL[intention]}
    </span>
  );
}

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return (
    <span className={cn(base, "border-border bg-secondary text-secondary-foreground")}>
      {lifecycle === "trial" || lifecycle === "active" ? (
        <CircleDot className="size-3" aria-hidden="true" />
      ) : (
        <CircleDashed className="size-3" aria-hidden="true" />
      )}
      Status: {LIFECYCLE_LABEL[lifecycle]}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: PurchaseChannel }) {
  const Icon =
    channel === "apple_app_store"
      ? Apple
      : channel === "google_play"
        ? Smartphone
        : channel === "web"
          ? Globe
          : HelpCircle;
  return (
    <span className={cn(base, "border-border bg-muted text-muted-foreground")}>
      <Icon className="size-3" aria-hidden="true" />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

export function VerificationBadge({ state }: { state: Verification }) {
  const label: Record<Verification, string> = {
    unconfirmed: "Needs confirmation",
    confirmed: "Confirmed by you",
    conflicted: "Conflicting evidence",
  };
  const styles: Record<Verification, string> = {
    unconfirmed: "border-action/40 bg-action-soft text-action",
    confirmed: "border-trial/40 bg-trial-soft text-trial",
    conflicted: "border-warn/40 bg-warn-soft text-warn",
  };
  return <span className={cn(base, styles[state])}>{label[state]}</span>;
}

export function OriginBadge({ origin }: { origin: OriginType }) {
  return (
    <span className={cn(base, "border-border bg-paper text-muted-foreground")}>
      Source: {ORIGIN_LABEL[origin]}
    </span>
  );
}

/** Event marker used on the calendar. Shape + text, never colour alone. */
export function EventMarker({
  type,
  estimated,
  className,
}: {
  type: "action" | "bill" | "trial_end";
  estimated?: boolean;
  className?: string;
}) {
  if (type === "action") {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block size-2.5 rotate-45 bg-action", className)}
      />
    );
  }
  if (type === "trial_end") {
    return (
      <span
        aria-hidden="true"
        className={cn("inline-block size-2.5 rounded-full border-2 border-trial", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 rounded-full",
        estimated ? "border border-dashed border-billing" : "bg-billing",
        className,
      )}
    />
  );
}

export function SampleTag() {
  return (
    <span className={cn(base, "border-dashed border-border bg-transparent text-muted-foreground")}>
      Sample data
    </span>
  );
}

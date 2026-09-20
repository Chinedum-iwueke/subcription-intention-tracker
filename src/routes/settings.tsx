import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCommitStore } from "@/lib/commit/store";
import { getCloudClient } from "@/lib/commit/cloud";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Commit" },
      {
        name: "description",
        content:
          "Timezone, locale, planning buffers and reminder preferences for your Commit account.",
      },
      { property: "og:title", content: "Settings — Commit" },
      {
        property: "og:description",
        content: "Adjust planning buffers, delivery preferences and demo data.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, setSettings, resetDemo, mode, userEmail, commitments, reviewCandidates } = useCommitStore();
  const emailAvailable = mode === "cloud" && import.meta.env["VITE_COMMIT_EMAIL_AVAILABLE"] === "true";
  const [deliveryStatuses, setDeliveryStatuses] = React.useState<Array<{ id: string; status: string; action_date: string; commitment_id: string; scheduled_at: string; snoozed_until: string | null }>>([]);
  const [snoozeDates, setSnoozeDates] = React.useState<Record<string, string>>({});
  const [calendarActive, setCalendarActive] = React.useState(false);
  const [calendarUrl, setCalendarUrl] = React.useState('');
  const [pushDevices, setPushDevices] = React.useState<Array<{ id: string; created_at: string; revoked_at: string | null }>>([]);
  const pushAvailable = mode === 'cloud' && Boolean(import.meta.env['VITE_COMMIT_VAPID_PUBLIC_KEY']) && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  async function loadPushDevices() {
    const { data } = await getCloudClient()!.from('commit_push_subscriptions').select('id,created_at,revoked_at');
    setPushDevices(data ?? []);
  }
  React.useEffect(() => { if (mode === 'cloud') void loadPushDevices(); }, [mode]);
  async function enablePush() {
    if (!pushAvailable) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { toast.error('Notifications were not permitted on this device.'); return; }
    const registration = await navigator.serviceWorker.ready;
    const key = import.meta.env['VITE_COMMIT_VAPID_PUBLIC_KEY'] as string;
    const binary = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    try {
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: binary });
      const json = subscription.toJSON();
      const { data: deviceId, error } = await getCloudClient()!.rpc('register_commit_push', { p_endpoint: subscription.endpoint, p_p256dh: json.keys?.['p256dh'], p_auth: json.keys?.['auth'] });
      if (error) throw error;
      if (deviceId) localStorage.setItem('commit.push.device-id', deviceId);
      setSettings({ pushEnabled: true, pushConsentAt: new Date().toISOString() });
      await loadPushDevices();
      toast.success('Push enabled on this device', { description: 'Delivery still depends on your browser and operating system.' });
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Could not enable push.'); }
  }
  async function revokePush(id: string) {
    const { error } = await getCloudClient()!.rpc('revoke_commit_push', { p_id: id });
    if (error) { toast.error(error.message); return; }
    if (localStorage.getItem('commit.push.device-id') === id) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      localStorage.removeItem('commit.push.device-id');
    }
    await loadPushDevices();
    toast.success('Device push revoked');
  }
  React.useEffect(() => {
    if (mode !== 'cloud') return;
    void getCloudClient()!.from('commit_calendar_feeds').select('revoked_at').maybeSingle().then(({ data }) => setCalendarActive(Boolean(data && !data.revoked_at)));
  }, [mode]);
  async function enableCalendar() {
    const client = getCloudClient();
    if (!client) return;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const { error } = await client.rpc('set_commit_calendar_feed', { p_token: token });
    if (error) { toast.error(error.message); return; }
    setCalendarUrl(`${import.meta.env['VITE_SUPABASE_URL']}/functions/v1/calendar-feed?token=${token}`);
    setCalendarActive(true);
    toast.success('Calendar feed enabled');
  }
  async function revokeCalendar() {
    const client = getCloudClient();
    if (!client) return;
    const { error } = await client.rpc('revoke_commit_calendar_feed');
    if (error) { toast.error(error.message); return; }
    setCalendarActive(false); setCalendarUrl('');
    toast.success('Calendar feed revoked');
  }
  async function loadDeliveryStatuses() {
    const { data } = await getCloudClient()!.from("commit_reminder_jobs")
      .select("id,status,action_date,commitment_id,scheduled_at,snoozed_until")
      .order("created_at", { ascending: false }).limit(10);
    setDeliveryStatuses(data ?? []);
  }
  React.useEffect(() => {
    if (mode !== "cloud") return;
    void loadDeliveryStatuses();
  }, [mode, settings.outboundEnabled]);

  async function snooze(id: string) {
    const value = snoozeDates[id];
    if (!value || Number.isNaN(new Date(value).getTime())) { toast.error("Choose a valid snooze time."); return; }
    const { error } = await getCloudClient()!.rpc("snooze_commit_reminder", { p_job_id: id, p_until: new Date(value).toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success("Reminder snoozed");
    await loadDeliveryStatuses();
  }

  async function exportAccount() {
    const artifacts = mode === "cloud" ? await getCloudClient()!.from("evidence_artifacts")
      .select("id,commitment_id,object_path,sha256,origin,captured_at,retain_until,deleted_at") : null;
    if (artifacts?.error) { toast.error(`Export could not read evidence metadata: ${artifacts.error.message}`); return; }
    const sourceStatus = mode === "cloud" ? await getCloudClient()!.rpc("commit_discovery_status") : null;
    if (sourceStatus?.error) { toast.error(`Export could not read source consent metadata: ${sourceStatus.error.message}`); return; }
    const file = new Blob([JSON.stringify({ format: "commit-export-v1", exportedAt: new Date().toISOString(), commitments, reviewCandidates, settings,
      evidenceArtifacts: artifacts?.data ?? [], discoveryConnections: sourceStatus?.data ?? [] }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = href;
    link.download = "commit-export.json";
    link.click();
    URL.revokeObjectURL(href);
  }

  async function deleteAccount() {
    if (window.prompt("Type DELETE to permanently remove your Commit account and records") !== "DELETE") return;
    const client = getCloudClient();
    if (!client) return;
    const sources = await client.rpc("commit_discovery_status");
    if (sources.error) { toast.error(`Could not check connected sources: ${sources.error.message}`); return; }
    if ((sources.data ?? []).some((item: { status: string; last_error: string | null }) => item.status !== 'disconnected' || item.last_error)) {
      toast.error('Disconnect and revoke discovery sources before deleting your account.'); return;
    }
    const artifacts = await client.from("evidence_artifacts").select("object_path").is("deleted_at", null);
    if (artifacts.error) { toast.error(artifacts.error.message); return; }
    const paths = (artifacts.data ?? []).map((item) => item.object_path);
    for (let index = 0; index < paths.length; index += 100) {
      const removed = await client.storage.from("commit-evidence").remove(paths.slice(index, index + 100));
      if (removed.error) { toast.error(`Could not remove private evidence: ${removed.error.message}`); return; }
    }
    const { error } = await client.rpc("delete_my_commit_account");
    if (error) { toast.error(error.message); return; }
    await client.auth.signOut();
    window.location.assign("/auth");
  }

  return (
    <AppShell
      title="Settings"
      lede="Planning buffers affect new target suggestions. Display and reminder preferences do not change contractual dates."
    >
      <div className="space-y-6">
        <Panel title="Calendar feed" description="Optional live calendar of known decision targets, merchant cutoffs and next projected bills. Unknown dates are omitted.">
          {mode === 'cloud' ? <div className="space-y-3 text-sm">
            <p>{calendarActive ? 'Feed enabled.' : 'Feed off.'} A copied calendar may refresh late and may retain cached events after revocation. The private link grants read access to these event titles; handle it like a password.</p>
            {calendarUrl && <div><Label htmlFor="calendar-url">Your feed URL — copy it now; Commit does not store the unencrypted token</Label><Input id="calendar-url" readOnly value={calendarUrl} onFocus={(event) => event.target.select()} /><Button type="button" variant="outline" className="mt-2" onClick={() => void navigator.clipboard.writeText(calendarUrl).then(() => toast.success('Feed URL copied')).catch(() => toast.error('Copy the URL manually'))}>Copy feed URL</Button></div>}
            <div className="flex gap-2"><Button type="button" onClick={enableCalendar}>{calendarActive ? 'Rotate feed link' : 'Enable feed'}</Button>{calendarActive && <Button type="button" variant="outline" onClick={revokeCalendar}>Revoke feed</Button>}</div>
          </div> : <p className="text-sm text-muted-foreground">Calendar feeds require a signed-in cloud account.</p>}
        </Panel>
        <Panel title="PWA push" description="Optional device notifications for dated Review or Cancel actions. Email and in-app actions remain separate.">
          <div className="space-y-3 text-sm">
            <p>Install Commit from your browser menu if available. A PWA cannot read subscriptions in other apps. Notifications may arrive late or be blocked by the browser or operating system.</p>
            {pushAvailable ? <Button type="button" onClick={enablePush}>Enable push on this device</Button> : <p className="text-muted-foreground">Push requires a configured cloud project, a public VAPID key, HTTPS, and browser support.</p>}
            {pushDevices.filter((device) => !device.revoked_at).map((device) => <div key={device.id} className="flex items-center justify-between gap-3"><span>Device added {new Date(device.created_at).toLocaleDateString()} · {device.id.slice(0, 8)}</span><Button type="button" variant="outline" onClick={() => revokePush(device.id)}>Revoke</Button></div>)}
            {settings.pushEnabled && <Button type="button" variant="outline" onClick={() => setSettings({ pushEnabled: false, pushConsentAt: null })}>Turn off all push</Button>}
          </div>
        </Panel>
        <Panel title="Locale and timezone" description="Saved preferences for a future live release. This demo still formats dates and money in its default locale.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="tz">Timezone</Label>
              <Input
                id="tz"
                className="mt-1.5"
                value={settings.timezone}
                onChange={(e) => setSettings({ timezone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="locale">Locale</Label>
              <Input
                id="locale"
                className="mt-1.5"
                value={settings.locale}
                onChange={(e) => setSettings({ locale: e.target.value })}
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Locale does not currently change display formatting. {mode === "cloud" ? "Your timezone sets the local hour for optional email reminders." : "The demo sends no reminders."} A merchant cutoff stays anchored to the merchant&apos;s own timezone.
          </p>
        </Panel>

        <Panel
          title="Planning buffers"
          description="Provisional defaults to test, not contractual deadlines. You can always override a target on a record."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <BufferField
              id="buf-review"
              label="Review target"
              suffix="days before the earliest known date"
              value={settings.reviewBufferDays}
              onChange={(reviewBufferDays) => setSettings({ reviewBufferDays })}
            />
            <BufferField
              id="buf-cancel-cutoff"
              label="Cancel target (cutoff known)"
              suffix="days before the merchant cutoff"
              value={settings.cancelBufferCutoffDays}
              onChange={(cancelBufferCutoffDays) => setSettings({ cancelBufferCutoffDays })}
            />
            <BufferField
              id="buf-cancel-bill"
              label="Cancel target (cutoff unknown)"
              suffix="days before the next bill"
              value={settings.cancelBufferBillDays}
              onChange={(cancelBufferBillDays) => setSettings({ cancelBufferBillDays })}
            />
          </div>
        </Panel>

        <Panel
          title="Reminders"
          description={emailAvailable ? "Optional email reminders. In-app actions remain visible regardless of your choice." : "In-app action previews only. Email delivery is not configured for this installation."}
        >
          <div className="space-y-4">
            <ToggleRow
              id="outbound"
              label="Outbound email reminders"
              hint={emailAvailable ? "Opt in to email about dated Review or Cancel actions. Provider acceptance is not guaranteed delivery. Turn this off any time." : "Unavailable until a verified sender and scheduled worker are deployed. In-app actions still appear."}
              checked={settings.outboundEnabled}
              disabled={!emailAvailable}
              onChange={(outboundEnabled) => setSettings({ outboundEnabled, outboundConsentAt: outboundEnabled ? new Date().toISOString() : null })}
            />
            <ToggleRow
              id="quiet"
              label="Quiet hours 20:00–08:00"
              hint="Messages that would land inside quiet hours move to the next delivery window."
              checked={settings.quietHours}
              onChange={(quietHours) => setSettings({ quietHours })}
            />
            <ToggleRow
              id="privacy"
              label="Privacy mode for notification text"
              hint="Replaces merchant names and amounts with “A commitment needs your attention.”"
              checked={settings.privacyMode}
              onChange={(privacyMode) => setSettings({ privacyMode })}
            />
            <div className="max-w-40">
              <Label htmlFor="hour">Delivery hour</Label>
              <Input
                id="hour"
                type="number"
                min={0}
                max={23}
                className="mt-1.5"
                value={settings.deliveryHour}
                onChange={(e) => setSettings({ deliveryHour: Math.max(0, Math.min(23, Math.round(Number(e.target.value) || 0))) })}
              />
            </div>
          </div>
          <p className="mt-4 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Reminders are helpful prompts, never guaranteed financial protection. They can be delayed,
            muted or blocked.
          </p>
          {mode === "cloud" && deliveryStatuses.length > 0 ? <div className="mt-4 text-xs"><h3 className="font-medium">Recent email outcomes</h3><ul className="mt-2 space-y-3">{deliveryStatuses.map((job) => <li key={job.id} className="rounded-md border border-border p-2"><span>{job.commitment_id}: {job.action_date} — {job.status.replaceAll("_", " ")}{job.snoozed_until ? " (snoozed)" : ""}</span>{job.status === "queued" ? <div className="mt-2 flex flex-wrap items-end gap-2"><div><Label htmlFor={`snooze-${job.id}`}>Snooze until</Label><Input id={`snooze-${job.id}`} type="datetime-local" value={snoozeDates[job.id] ?? ""} onChange={(event) => setSnoozeDates((dates) => ({ ...dates, [job.id]: event.target.value }))} /></div><Button size="sm" variant="outline" onClick={() => void snooze(job.id)}>Snooze</Button></div> : null}</li>)}</ul></div> : null}
        </Panel>

        {mode === "demo" ? <Panel title="Demo data" description="Sample records are stored in this browser.">
          <p className="text-sm text-muted-foreground">
            Nothing here is a real charge, and no account is connected. Resetting restores the
            original sample set and discards edits you made in this browser.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              resetDemo();
              toast.success("Sample data restored");
            }}
          >
            Reset sample data
          </Button>
        </Panel> : <Panel title="Account and data" description={userEmail ?? "Private account"}>
          <p className="text-sm text-muted-foreground">Export includes your records, review decisions, terms, claims, provenance and history. Keep this file private.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void exportAccount()}>Export account data</Button>
            <Button variant="outline" onClick={async () => { await getCloudClient()?.auth.signOut(); window.location.assign("/auth"); }}>Sign out</Button>
            <Button variant="destructive" onClick={deleteAccount}>Delete account</Button>
          </div>
        </Panel>}
      </div>
    </AppShell>
  );
}

function BufferField({
  id,
  label,
  suffix,
  value,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={90}
        className="mt-1.5"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(90, Math.round(Number(e.target.value) || 0))))}
      />
      <p className="mt-1 text-xs text-muted-foreground">{suffix}</p>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

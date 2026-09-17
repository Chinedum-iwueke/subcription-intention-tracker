import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCommitStore } from "@/lib/commit/store";

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
  const { settings, setSettings, resetDemo } = useCommitStore();

  return (
    <AppShell
      title="Settings"
      lede="Preferences affect how dates are displayed and proposed. They never change a contractual instant recorded from merchant evidence."
    >
      <div className="space-y-6">
        <Panel title="Locale and timezone" description="Used for display and for proposed reminder delivery times.">
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
            Travel changes display and delivery preferences only. A merchant cutoff stays anchored to
            the merchant&apos;s own timezone.
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
          description="Preview only in this phase. Commit is not sending anything from here."
        >
          <div className="space-y-4">
            <ToggleRow
              id="outbound"
              label="Outbound email reminders"
              hint="Off in the demo. Every confirmed, dated action still appears in the app regardless of outbound permission."
              checked={settings.outboundEnabled}
              onChange={(outboundEnabled) => setSettings({ outboundEnabled })}
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
                onChange={(e) => setSettings({ deliveryHour: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="mt-4 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Reminders are helpful prompts, never guaranteed financial protection. They can be delayed,
            muted or blocked.
          </p>
        </Panel>

        <Panel title="Demo data" description="Phase 1 runs entirely on synthetic records stored in this browser.">
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
        </Panel>
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
        onChange={(e) => onChange(Number(e.target.value))}
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
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

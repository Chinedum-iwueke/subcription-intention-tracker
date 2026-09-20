import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { useCommitStore } from "@/lib/commit/store";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  const { mode, commitments } = useCommitStore();
  return <AppShell title="Start with one commitment" lede="You can build your inventory gradually. A merchant name and your intention are enough to begin; unknown dates stay unknown.">
    <div className="grid gap-5 md:grid-cols-2">
      <Panel title="Enter what you know" description="Useful for a current trial or an existing subscription.">
        <p className="text-sm text-muted-foreground">Add the merchant, original currency, purchase channel, and any date you can verify. Commit will show a schedule preview without inventing missing terms.</p>
        <Button asChild className="mt-4"><Link to="/add">Add a commitment</Link></Button>
      </Panel>
      <Panel title="Start from evidence" description="Check a receipt, invoice, or phone screenshot.">
        <p className="text-sm text-muted-foreground">Review each field beside its source before it enters your inventory. Redact payment and address details before uploading.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/review">Open review inbox</Link></Button>
      </Panel>
    </div>
    <Panel title="Purchased through Apple?" className="mt-5">
      <p className="text-sm text-muted-foreground">On your Apple device, open Settings → your name → Subscriptions to find the plan and renewal terms, then enter them here. Commit cannot automatically read your Apple subscriptions.</p>
    </Panel>
    <p className="mt-5 text-sm text-muted-foreground">{mode === "demo" ? "You are exploring synthetic demo data. Private accounts become available when this installation is connected to Supabase." : `You have ${commitments.length} commitment${commitments.length === 1 ? "" : "s"} so far. Reminders are optional and can be chosen later in Settings.`}</p>
  </AppShell>;
}

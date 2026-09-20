import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Panel } from "@/components/commit/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloudConfigured, getCloudClient } from "@/lib/commit/cloud";
import { useCommitStore } from "@/lib/commit/store";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const { userEmail } = useCommitStore();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [create, setCreate] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const next = typeof window === "undefined" ? "/upcoming" : new URLSearchParams(window.location.search).get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/upcoming";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const client = getCloudClient();
    if (!client) return;
    setBusy(true);
    setMessage("");
    const result = create
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (result.data.session) window.location.assign(destination);
    else setMessage("Check your email to confirm your account, then sign in.");
  }

  return <AppShell title="Your account" lede="Keep your commitments private and available across devices.">
    <Panel title={userEmail ? "Signed in" : create ? "Create account" : "Sign in"}>
      {!cloudConfigured ? <p className="text-sm text-muted-foreground">This installation is in demo mode. Add Supabase environment values to enable accounts.</p> : userEmail ? <p className="text-sm">Signed in as {userEmail}. <a className="underline" href={destination}>Continue</a></p> :
        <form className="max-w-sm space-y-4" onSubmit={submit}>
          <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="password">Password</Label><Input id="password" type="password" required minLength={6} autoComplete={create ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          <Button disabled={busy} type="submit">{busy ? "Please wait…" : create ? "Create account" : "Sign in"}</Button>
          <button type="button" className="block text-sm underline" onClick={() => { setCreate(!create); setMessage(""); }}>{create ? "Already have an account? Sign in" : "Create an account"}</button>
        </form>}
    </Panel>
    <p className="mt-4 text-sm text-muted-foreground">Want to explore first? <Link to="/demo/checkout" className="underline">Try the labeled checkout simulation</Link>. It does not save a record to an account.</p>
  </AppShell>;
}

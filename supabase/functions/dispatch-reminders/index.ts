// Deploy as a private scheduled function. Set WORKER_TOKEN, RESEND_API_KEY,
// REMINDER_FROM, APP_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

Deno.serve(async (request) => {
  if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${required("WORKER_TOKEN")}`)
    return new Response("Unauthorized", { status: 401 });
  if (Deno.env.get("EMAIL_DELIVERY_ENABLED") !== "true")
    return Response.json({ disabled: true });

  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: jobs, error: claimError } = await client.rpc("claim_commit_reminders", { p_limit: 20 });
  if (claimError) return new Response("Could not claim jobs", { status: 500 });
  const appUrl = required("APP_URL").replace(/\/$/, "");
  let accepted = 0;
  let suppressed = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const [record, profile, auth] = await Promise.all([
      client.from("commitments").select("version,body").eq("owner_id", job.owner_id).eq("id", job.commitment_id).maybeSingle(),
      client.from("commit_profiles").select("settings").eq("owner_id", job.owner_id).maybeSingle(),
      client.auth.admin.getUserById(job.owner_id),
    ]);
    const body = record.data?.body;
    const settings = profile.data?.settings;
    const email = auth.data.user?.email;
    const actionDate = body?.reviewTargetDate;
    const valid = !record.error && !profile.error && !auth.error && email &&
      record.data?.version === job.commitment_version &&
      settings?.outboundEnabled === true && Boolean(settings?.outboundConsentAt) &&
      ["review", "cancel"].includes(body?.intention) && body?.cancellation !== "confirmed" &&
      !["canceled", "expired"].includes(body?.lifecycle) && actionDate === job.action_date &&
      job.action_date >= new Date().toISOString().slice(0, 10);
    if (!valid) {
      await client.from("commit_reminder_jobs").update({ status: "suppressed", last_error: "Current record or consent no longer permits delivery", locked_until: null }).eq("id", job.id).eq("status", "leased");
      suppressed++;
      continue;
    }

    const generic = settings.privacyMode === true;
    const subject = generic ? "A commitment needs your attention" : `${body.intention === "cancel" ? "Cancel" : "Review"} ${body.merchant} by ${actionDate}`;
    const path = `${appUrl}/subscriptions/${encodeURIComponent(job.commitment_id)}`;
    const text = `${subject}\n\nOpen Commit: ${path}\n\nManage reminders: ${appUrl}/settings`;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${required("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": job.id,
        },
        body: JSON.stringify({ from: required("REMINDER_FROM"), to: [email], subject,
          text, html: `<p>${escapeHtml(subject)}</p><p><a href="${escapeHtml(path)}">Open Commit</a></p><p><a href="${escapeHtml(appUrl)}/settings">Manage reminders</a></p>` }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Provider returned ${response.status}`);
      await client.from("commit_reminder_jobs").update({ status: "provider_accepted", provider_id: result.id ?? null, locked_until: null, last_error: null }).eq("id", job.id).eq("status", "leased");
      accepted++;
    } catch (error) {
      const retry = job.attempts < 3 && job.action_date >= new Date().toISOString().slice(0, 10);
      await client.from("commit_reminder_jobs").update({ status: retry ? "queued" : "failed",
        scheduled_at: new Date(Date.now() + Math.min(60, 2 ** job.attempts * 5) * 60_000).toISOString(),
        locked_until: null, last_error: error instanceof Error ? error.message.slice(0, 200) : "Provider error" })
        .eq("id", job.id).eq("status", "leased");
      failed++;
    }
  }
  return Response.json({ accepted, suppressed, failed });
});

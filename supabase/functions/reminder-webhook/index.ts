// Resend delivery status webhook. Disable JWT verification for this endpoint only;
// Svix signature verification below authenticates the raw request instead.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@6.28.1";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await request.text();
  if (payload.length > 100_000) return new Response("Payload too large", { status: 413 });
  let event: { type?: string; data?: { email_id?: string } };
  try {
    const resend = new Resend(required("RESEND_API_KEY"));
    event = resend.webhooks.verify({ payload, headers: {
      id: request.headers.get("svix-id") ?? "",
      timestamp: request.headers.get("svix-timestamp") ?? "",
      signature: request.headers.get("svix-signature") ?? "",
    }, webhookSecret: required("RESEND_WEBHOOK_SECRET") });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  const status = ({
    "email.delivered": "delivered", "email.delivery_delayed": "delivery_delayed",
    "email.bounced": "bounced", "email.complained": "complained", "email.failed": "failed",
  } as Record<string, string>)[event.type ?? ""];
  const eventId = request.headers.get("svix-id");
  const providerId = event.data?.email_id;
  if (!status || !eventId || !providerId) return new Response("Ignored", { status: 200 });
  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const job = await client.from("commit_reminder_jobs").select("id").eq("provider_id", providerId).maybeSingle();
  if (job.error || !job.data) return new Response("Job not ready; retry later", { status: 503 });
  const inserted = await client.from("commit_reminder_webhook_events")
    .insert({ event_id: eventId, provider_id: providerId, event_type: event.type });
  if (inserted.error && inserted.error.code !== "23505") return new Response("Could not record event", { status: 500 });
  const updated = await client.from("commit_reminder_jobs").update({ status })
    .eq("provider_id", providerId).in("status", ["provider_accepted", "delivery_delayed"]);
  if (updated.error) return new Response("Could not record status", { status: 500 });
  return new Response("OK", { status: 200 });
});

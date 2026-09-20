// Scheduled private Storage cleanup. Configure RETENTION_WORKER_TOKEN as a secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${required("RETENTION_WORKER_TOKEN")}`)
    return new Response("Unauthorized", { status: 401 });
  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: artifacts, error } = await client.from("evidence_artifacts")
    .select("id,object_path").is("deleted_at", null).lte("retain_until", new Date().toISOString())
    .order("retain_until", { ascending: true }).limit(100);
  if (error) return new Response("Could not load due artifacts", { status: 500 });
  let expired = 0;
  let failed = 0;
  for (const artifact of artifacts ?? []) {
    const removed = await client.storage.from("commit-evidence").remove([artifact.object_path]);
    if (removed.error) { failed++; continue; }
    const marked = await client.rpc("mark_commit_evidence_expired", { p_artifact_id: artifact.id });
    if (marked.error) failed++;
    else expired++;
  }
  return Response.json({ expired, failed });
});

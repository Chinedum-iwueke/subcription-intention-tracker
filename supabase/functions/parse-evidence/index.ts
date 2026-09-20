// Private parser adapter. OCR_ENDPOINT must be an approved processor in the
// chosen region. It receives the raw file bytes and returns the bounded JSON
// contract described in supabase/README.md. No parser is called without it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { EXTRACTABLE_FIELDS, validateExtraction } from "../../../src/lib/commit/parser.ts";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (Deno.env.get("OCR_PROCESSING_ENABLED") !== "true")
    return new Response("Extraction is not enabled", { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const client = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => null);
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
  if (!candidateId || candidateId.length > 120) return new Response("Invalid candidate", { status: 400 });
  const { data: row, error: readError } = await client.from("review_candidates")
    .select("id,version,body").eq("owner_id", auth.user.id).eq("id", candidateId).maybeSingle();
  if (readError || !row?.body?.artifactPath || row.body.status !== "unreviewed")
    return new Response("Candidate not found", { status: 404 });
  if (!row.body.ocrConsentAt || row.body.ocrProcessor !== required("OCR_PROCESSOR_NAME")
    || row.body.ocrRegion !== required("OCR_PROCESSOR_REGION"))
    return new Response("OCR consent or processor does not match", { status: 403 });
  if (row.body.fields?.some((field: { decision: string }) => field.decision !== "pending"))
    return new Response("Manual review has already begun", { status: 409 });
  if (!row.body.artifactPath.startsWith(`${auth.user.id}/`)) return new Response("Invalid evidence", { status: 400 });

  const processing = { ...row.body, processingState: "extracting" };
  const started = await client.from("review_candidates").update({ body: processing, version: row.version + 1 })
    .eq("owner_id", auth.user.id).eq("id", candidateId).eq("version", row.version).select("version").single();
  if (started.error) return new Response("Candidate changed; reload and retry", { status: 409 });

  try {
    const file = await client.storage.from("commit-evidence").download(row.body.artifactPath);
    if (file.error || !file.data) throw new Error("Private evidence unavailable");
    const bytes = await file.data.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Evidence exceeds the 10 MB limit");
    const type = row.body.artifactPath.endsWith(".pdf") ? "application/pdf"
      : row.body.artifactPath.endsWith(".png") ? "image/png" : "image/jpeg";
    const response = await fetch(required("OCR_ENDPOINT"), {
      method: "POST", signal: AbortSignal.timeout(20_000),
      headers: { "Authorization": `Bearer ${required("OCR_TOKEN")}`, "Content-Type": type,
        "X-Commit-Origin": row.body.fields?.[0]?.origin ?? "receipt" },
      body: bytes,
    });
    if (!response.ok) throw new Error(`Processor returned ${response.status}`);
    const parsed = validateExtraction(await response.json());
    const candidates = parsed.map((item, index) => {
      const fields = Object.entries(EXTRACTABLE_FIELDS).map(([key, definition]) => {
        const found = item.fields.find((field) => field.key === key);
        return { key, label: definition.label, kind: definition.kind, extracted: found?.value ?? null,
          value: found?.value ?? null,
          excerpt: found ? `${found.page ? `Page ${found.page}: ` : ""}${found.excerpt}` : "Not found in the supplied file.",
          origin: row.body.fields?.[0]?.origin ?? "receipt", decision: "pending" };
      });
      return { ...row.body, id: index === 0 ? candidateId : `${candidateId}-item-${index + 1}`,
        merchant: item.merchant, planNickname: item.planNickname, nonRecurring: item.nonRecurring,
        sourceExcerpt: item.sourceExcerpt, fields, processingState: "needs_review", capturedAt: new Date().toISOString() };
    });
    const applied = await client.rpc("apply_commit_extraction", {
      p_owner: auth.user.id, p_candidate_id: candidateId,
      p_expected_version: started.data.version, p_items: candidates,
    });
    if (applied.error) throw applied.error;
    return Response.json({ candidates: candidates.length });
  } catch (error) {
    await client.from("review_candidates").update({ body: { ...row.body, processingState: "failed" }, version: started.data.version + 1 })
      .eq("owner_id", auth.user.id).eq("id", candidateId).eq("version", started.data.version);
    return Response.json({ error: error instanceof Error ? error.message : "Extraction failed" }, { status: 502 });
  }
});

import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
if (process.env.STAGING_ALLOW_DISPOSABLE_WRITES !== "yes")
  throw new Error("Set STAGING_ALLOW_DISPOSABLE_WRITES=yes only for an isolated staging project.");
const url = need("STAGING_SUPABASE_URL");
if (!/https:\/\/.+\.supabase\.co$/.test(url)) throw new Error("Use a Supabase staging project URL.");
const key = need("STAGING_PUBLISHABLE_KEY");
const client = (token) => createClient(url, key, {
  accessToken: async () => token,
  auth: { persistSession: false, autoRefreshToken: false },
});
const a = client(need("STAGING_USER_A_JWT"));
const b = client(need("STAGING_USER_B_JWT"));
const [au, bu] = await Promise.all([a.auth.getUser(need("STAGING_USER_A_JWT")), b.auth.getUser(need("STAGING_USER_B_JWT"))]);
assert.ok(au.data.user && bu.data.user && au.data.user.id !== bu.data.user.id, "two distinct authenticated users required");

const id = `verification-${crypto.randomUUID()}`;
const body = { id, merchant: "Disposable staging probe", planNickname: "Probe", category: "Test",
  channel: "web", lifecycle: "active", intention: "review", cancellation: "not_started",
  terms: { id: "v1", effectiveFrom: new Date().toISOString().slice(0, 10), amountMinor: null,
    currency: "EUR", recurrence: null }, termHistory: [], claims: [], history: [],
  nextBillDate: null, reviewTargetDate: null, sample: false };
const created = await a.rpc("save_commitment", { p_id: id, p_expected_version: 0, p_body: body });
if (created.error) throw created.error;
const [readA, readB, updateB, directA] = await Promise.all([
  a.from("commitments").select("id,version").eq("id", id),
  b.from("commitments").select("id,version").eq("id", id),
  b.rpc("save_commitment", { p_id: id, p_expected_version: 1, p_body: body }),
  a.from("commitments").update({ body }).eq("id", id),
]);
assert.equal(readA.data?.length, 1, "owner A must read their row");
assert.equal(readB.data?.length, 0, "owner B must not read A's row");
assert.ok(updateB.error, "owner B must not update A's row by guessed id");
assert.ok(directA.error, "direct table writes must be denied");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=", "base64");
const path = `${au.data.user.id}/${id}.png`;
const uploaded = await a.storage.from("commit-evidence").upload(path, new Blob([png], { type: "image/png" }), { upsert: false });
if (uploaded.error) throw uploaded.error;
try {
  const [ownerFile, otherFile] = await Promise.all([
    a.storage.from("commit-evidence").download(path),
    b.storage.from("commit-evidence").download(path),
  ]);
  assert.ok(ownerFile.data && !ownerFile.error, "owner A must read their evidence");
  assert.ok(otherFile.error, "owner B must not read A's evidence");
} finally {
  const removed = await a.storage.from("commit-evidence").remove([path]);
  if (removed.error) throw removed.error;
}
console.log(`Staging owner-isolation probes passed. Disposable row ${id} remains for staging reset.`);

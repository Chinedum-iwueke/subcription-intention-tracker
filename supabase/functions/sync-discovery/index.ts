// Scheduled, private V2 ingestion. Never logs message bodies, transaction names,
// provider tokens, or account IDs. All findings remain unreviewed candidates.
import { admin, decrypt, plaid, required, sha256 } from '../_shared/discovery.ts';
import { bankProposals, emailProposal, type BankObservation, type DiscoveryProposal } from '../../../src/lib/commit/discovery.ts';

const db = admin();
const now = () => new Date().toISOString();
const clean = (text: unknown, max = 120) => typeof text === 'string' ? text.replace(/[\u0000-\u001f]/g, ' ').slice(0, max).trim() : '';
const twoDecimalCurrency = (currency: unknown) => {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return false;
  try { return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits === 2; }
  catch { return false; }
};
async function current(id: string) {
  const { data } = await db.from('commit_discovery_connections').select('status,consent_expires_at').eq('id', id).maybeSingle();
  return data?.status === 'active' && (!data.consent_expires_at || data.consent_expires_at > now());
}
async function createCandidate(connection: any, proposal: DiscoveryProposal, key: string, origin: 'receipt' | 'transaction') {
  if (!(await current(connection.id))) return false;
  const id = `${origin === 'receipt' ? 'gmail' : 'bank'}-${(await sha256(`${connection.id}:${key}`)).slice(0, 36)}`;
  const { data: existing } = await db.from('commitments').select('id,body').eq('owner_id', connection.owner_id).limit(500);
  const match = (existing ?? []).find((row) => row.body?.merchant?.toLowerCase() === proposal.merchant.toLowerCase() && row.body?.terms?.currency === proposal.currency);
  const fields = proposal.fields.map((field) => ({ key: field.key,
    label: ({ amount: 'Recurring amount', interval: 'Billing interval', next_bill: 'Next bill date', cutoff: 'Merchant action cutoff' } as Record<string,string>)[field.key],
    kind: field.key === 'amount' ? 'money' : field.key === 'interval' ? 'interval' : 'date',
    extracted: field.value, value: field.value, excerpt: field.excerpt, origin, decision: 'pending',
    ...(match && field.key === 'amount' ? { currentValue: match.body.terms.amountMinor == null ? null : (match.body.terms.amountMinor / 100).toFixed(2) } : {}) }));
  const candidate = { id, kind: match ? 'duplicate' : 'new', merchant: proposal.merchant, planNickname: '', category: 'Other', channel: 'web',
    currency: proposal.currency, sourceLabel: origin === 'receipt' ? 'Consented Gmail discovery' : 'Read-only bank transaction pattern',
    capturedAt: now(), sourceExcerpt: proposal.sourceExcerpt, fields, status: 'unreviewed', sample: false,
    discoveryConnectionId: connection.id, confidence: proposal.confidence,
    ...(match ? { matchedCommitmentId: match.id, matchReason: 'Same merchant and currency. Verify the plan/account before deciding.' } : {}) };
  const { error } = await db.from('review_candidates').upsert({ owner_id: connection.owner_id, id, body: candidate }, { onConflict: 'owner_id,id', ignoreDuplicates: true });
  if (error) throw error;
  return true;
}
function gmailText(message: any): string {
  const parts: any[] = [message.payload, ...(message.payload?.parts ?? [])];
  const plain = parts.find((part) => part?.mimeType === 'text/plain' && typeof part?.body?.data === 'string');
  if (!plain) return clean(message.snippet, 500);
  const data = plain.body.data.replace(/-/g, '+').replace(/_/g, '/');
  try { return new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0))).slice(0, 8000); }
  catch { return ''; }
}
async function gmail(connection: any) {
  const refresh = await decrypt(connection.token_cipher, connection.token_nonce);
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'),
      refresh_token: refresh, grant_type: 'refresh_token' }) });
  if (response.status === 400 || response.status === 401) throw new Error('reconnect');
  if (!response.ok) throw new Error('Gmail refresh failed');
  const access = (await response.json()).access_token;
  const since = connection.last_synced_at ? new Date(Date.parse(connection.last_synced_at) - 2 * 86_400_000) : new Date(Date.parse(connection.consented_at) - 90 * 86_400_000);
  const query = `after:${since.toISOString().slice(0, 10).replaceAll('-', '/')} {subscription renewal recurring trial}`;
  let page: string | null = connection.sync_cursor || null, count = 0;
  for (let batch = 0; batch < 3; batch++) {
    if (!(await current(connection.id))) break;
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', query); url.searchParams.set('maxResults', '50');
    if (page) url.searchParams.set('pageToken', page);
    const list = await fetch(url, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15000) });
    if (list.status === 401) throw new Error('reconnect');
    if (list.status === 400 && page) {
      await db.from('commit_discovery_connections').update({ sync_cursor: null }).eq('id', connection.id).eq('status', 'active');
      throw new Error('Gmail page cursor expired; scan will restart');
    }
    if (!list.ok) throw new Error('Gmail list failed');
    const result = await list.json();
    for (const item of result.messages ?? []) {
      if (!(await current(connection.id))) break;
      const detail = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,
        { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15000) });
      if (!detail.ok) continue;
      const message = await detail.json();
      const subject = clean(message.payload?.headers?.find((header: any) => header.name?.toLowerCase() === 'subject')?.value, 200);
      const proposal = emailProposal(subject, gmailText(message));
      if (proposal && await createCandidate(connection, proposal, item.id, 'receipt')) count++;
    }
    page = result.nextPageToken ?? null;
    if (!page) break;
  }
  // A bounded scan does not advance its window while additional pages remain.
  await db.from('commit_discovery_connections').update({ sync_cursor: page, last_synced_at: page ? connection.last_synced_at : now(), last_error: page ? 'Scan window incomplete; next run continues from cursor.' : null })
    .eq('id', connection.id).eq('status', 'active');
  return count;
}
async function bank(connection: any) {
  const access = await decrypt(connection.token_cipher, connection.token_nonce);
  const item = await plaid('/item/get', { access_token: access });
  const expires = item.item?.consent_expiration_time ?? null;
  if (expires && expires <= now()) {
    await db.from('commit_discovery_connections').update({ status: 'expired', consent_expires_at: expires }).eq('id', connection.id);
    return 0;
  }
  let cursor = connection.sync_cursor || null;
  let more = false;
  for (let page = 0; page < 10; page++) {
    if (!(await current(connection.id))) break;
    const result = await plaid('/transactions/sync', { access_token: access, cursor, count: 100 });
    if (!(await current(connection.id))) break;
    const added = [...(result.added ?? []), ...(result.modified ?? [])];
    const rows = added.filter((item: any) => !item.pending && item.amount > 0 && twoDecimalCurrency(item.iso_currency_code)).map((item: any) => ({
      owner_id: connection.owner_id, connection_id: connection.id, external_id: clean(item.transaction_id, 120),
      account_ref: clean(item.account_id, 120), merchant: clean(item.merchant_name || item.name, 80),
      observed_on: item.date, amount_minor: Math.round(item.amount * 100), currency: item.iso_currency_code, pending: false }));
    if (rows.length) { const { error } = await db.from('commit_discovery_observations').upsert(rows, { onConflict: 'connection_id,external_id' }); if (error) throw error; }
    const removed = (result.removed ?? []).map((item: any) => item.transaction_id);
    if (removed.length) await db.from('commit_discovery_observations').delete().eq('connection_id', connection.id).in('external_id', removed);
    cursor = result.next_cursor; more = result.has_more === true;
    if (!more) break;
  }
  if (more) throw new Error('Bank sync pagination exceeded limit; retry without advancing cursor');
  const { data } = await db.from('commit_discovery_observations').select('external_id,account_ref,merchant,observed_on,amount_minor,currency')
    .eq('connection_id', connection.id).order('observed_on', { ascending: false }).limit(1000);
  const observations: BankObservation[] = (data ?? []).map((row: any) => ({ externalId: row.external_id, accountRef: row.account_ref,
    merchant: row.merchant, observedOn: row.observed_on, amountMinor: row.amount_minor, currency: row.currency }));
  let count = 0;
  for (const proposal of bankProposals(observations)) if (await createCandidate(connection, proposal, proposal.groupKey, 'transaction')) count++;
  await db.from('commit_discovery_connections').update({ sync_cursor: cursor, consent_expires_at: expires, last_synced_at: now(), last_error: null })
    .eq('id', connection.id).eq('status', 'active');
  return count;
}
Deno.serve(async (request) => {
  if (request.method !== 'POST' || request.headers.get('authorization') !== `Bearer ${required('DISCOVERY_WORKER_TOKEN')}`)
    return new Response('Unauthorized', { status: 401 });
  if (Deno.env.get('DISCOVERY_INGESTION_ENABLED') !== 'true') return Response.json({ disabled: true });
  await db.from('commit_discovery_oauth_states').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());
  const { data: connections, error } = await db.from('commit_discovery_connections').select('*').eq('status', 'active').limit(10);
  if (error) return new Response('Could not read connections', { status: 500 });
  let candidates = 0, failures = 0;
  for (const connection of connections ?? []) {
    if (!(await current(connection.id))) { await db.from('commit_discovery_connections').update({ status: 'expired' }).eq('id', connection.id).eq('status', 'active'); continue; }
    try { candidates += connection.provider === 'gmail' ? await gmail(connection) : await bank(connection); }
    catch (caught) {
      const reconnect = caught instanceof Error && ['reconnect', 'ITEM_LOGIN_REQUIRED', 'INVALID_ACCESS_TOKEN', 'ITEM_NOT_FOUND'].includes(caught.message);
      await db.from('commit_discovery_connections').update({ status: reconnect ? 'needs_reconnect' : 'active', last_error: reconnect ? 'Reconnect required' : 'Sync failed; retry later' })
        .eq('id', connection.id).eq('status', 'active'); failures++;
    }
  }
  return Response.json({ scanned: connections?.length ?? 0, candidates, failures });
});

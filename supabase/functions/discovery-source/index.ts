import { admin, appOrigin, cors, decrypt, encrypt, owner, plaid, randomHex, required, sha256 } from '../_shared/discovery.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request) });
  const headers = cors(request);
  if (request.method !== 'POST' || request.headers.get('origin') !== appOrigin()) return new Response('Forbidden', { status: 403, headers });
  const userId = await owner(request);
  if (!userId) return new Response('Unauthorized', { status: 401, headers });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const db = admin();
  try {
    if (action === 'gmail_start') {
      if (Deno.env.get('GMAIL_DISCOVERY_ENABLED') !== 'true') return new Response('Gmail is unavailable', { status: 503, headers });
      const state = randomHex();
      const { error } = await db.from('commit_discovery_oauth_states').insert({ state_hash: await sha256(state), owner_id: userId,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
      if (error) throw error;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [key, value] of Object.entries({ client_id: required('GOOGLE_CLIENT_ID'), redirect_uri: `${required('SUPABASE_URL')}/functions/v1/gmail-discovery-callback`,
        response_type: 'code', scope: 'https://www.googleapis.com/auth/gmail.readonly', access_type: 'offline', prompt: 'consent', state })) url.searchParams.set(key, value);
      return Response.json({ url: url.href }, { headers });
    }
    if (action === 'plaid_start') {
      if (Deno.env.get('PLAID_DISCOVERY_ENABLED') !== 'true') return new Response('Bank discovery is unavailable', { status: 503, headers });
      const countries = required('PLAID_COUNTRY_CODES').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
      if (!countries.length) throw new Error('No supported countries configured');
      const result = await plaid('/link/token/create', { user: { client_user_id: userId }, client_name: 'Commit', products: ['transactions'],
        country_codes: countries, language: 'en', redirect_uri: required('PLAID_REDIRECT_URI') });
      return Response.json({ linkToken: result.link_token, countries }, { headers });
    }
    if (action === 'plaid_reconnect') {
      if (Deno.env.get('PLAID_DISCOVERY_ENABLED') !== 'true') return new Response('Bank discovery is unavailable', { status: 503, headers });
      const { data: row } = await db.from('commit_discovery_connections').select('*').eq('owner_id', userId).eq('id', body?.connectionId).eq('provider', 'plaid').maybeSingle();
      if (!row || row.status === 'disconnected') return new Response('Not found', { status: 404, headers });
      const access = await decrypt(row.token_cipher, row.token_nonce);
      const result = await plaid('/link/token/create', { user: { client_user_id: userId }, client_name: 'Commit', country_codes: required('PLAID_COUNTRY_CODES').split(','),
        language: 'en', access_token: access, redirect_uri: required('PLAID_REDIRECT_URI') });
      return Response.json({ linkToken: result.link_token, reconnectId: row.id }, { headers });
    }
    if (action === 'plaid_refresh') {
      const { data: row } = await db.from('commit_discovery_connections').select('*').eq('owner_id', userId).eq('id', body?.connectionId).eq('provider', 'plaid').maybeSingle();
      if (!row || row.status === 'disconnected') return new Response('Not found', { status: 404, headers });
      const access = await decrypt(row.token_cipher, row.token_nonce);
      const result = await plaid('/item/get', { access_token: access });
      const expiry = result.item?.consent_expiration_time ?? null;
      if (expiry && expiry <= new Date().toISOString()) return new Response('Consent is still expired', { status: 409, headers });
      await db.from('commit_discovery_connections').update({ status: 'active', consented_at: new Date().toISOString(),
        consent_expires_at: expiry, last_error: null }).eq('id', row.id).eq('owner_id', userId);
      return Response.json({ connected: true }, { headers });
    }
    if (action === 'plaid_exchange') {
      if (Deno.env.get('PLAID_DISCOVERY_ENABLED') !== 'true') return new Response('Bank discovery is unavailable', { status: 503, headers });
      if (typeof body?.publicToken !== 'string' || body.publicToken.length > 200) return new Response('Invalid token', { status: 400, headers });
      const result = await plaid('/item/public_token/exchange', { public_token: body.publicToken });
      const item = await plaid('/item/get', { access_token: result.access_token });
      const consentExpires = item.item?.consent_expiration_time ?? null;
      const secured = await encrypt(result.access_token);
      const { error } = await db.from('commit_discovery_connections').upsert({ owner_id: userId, provider: 'plaid', external_id: result.item_id,
        ...secured, status: 'active', consented_at: new Date().toISOString(), consent_expires_at: consentExpires, last_error: null },
        { onConflict: 'owner_id,provider,external_id' });
      if (error) { await plaid('/item/remove', { access_token: result.access_token }).catch(() => {}); throw error; }
      return Response.json({ connected: true, consentExpires }, { headers });
    }
    if (action === 'disconnect') {
      if (typeof body?.connectionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.connectionId)) return new Response('Invalid connection', { status: 400, headers });
      const { data: row } = await db.from('commit_discovery_connections').select('*').eq('owner_id', userId).eq('id', body.connectionId).maybeSingle();
      if (!row) return new Response('Not found', { status: 404, headers });
      // Stop ingestion first. Provider revocation is attempted while the token remains available.
      const stopped = await db.from('commit_discovery_connections').update({ status: 'disconnected' }).eq('id', row.id).eq('owner_id', userId);
      if (stopped.error) throw stopped.error;
      let revoked = false;
      try {
        const token = await decrypt(row.token_cipher, row.token_nonce);
        if (row.provider === 'gmail') {
          const response = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token }), signal: AbortSignal.timeout(15000) });
          revoked = response.ok;
        } else {
          await plaid('/item/remove', { access_token: token }); revoked = true;
        }
      } catch (caught) {
        if (row.provider === 'plaid' && caught instanceof Error && caught.message === 'ITEM_NOT_FOUND') revoked = true;
        // Other failures retain the encrypted token for a later revocation retry.
      }
      if (revoked) await db.from('commit_discovery_connections').update({ token_cipher: '', token_nonce: '', last_error: null }).eq('id', row.id);
      else await db.from('commit_discovery_connections').update({ last_error: 'Provider revocation needs operator retry. Ingestion stopped.' }).eq('id', row.id);
      return Response.json({ disconnected: true, providerRevoked: revoked }, { headers });
    }
    if (action === 'remove_findings') {
      const { data: row } = await db.from('commit_discovery_connections').select('id,status').eq('owner_id', userId).eq('id', body?.connectionId).maybeSingle();
      if (!row || row.status !== 'disconnected') return new Response('Disconnect first', { status: 409, headers });
      const candidates = await db.from('review_candidates').select('id,body').eq('owner_id', userId);
      if (candidates.error) throw candidates.error;
      const ids = (candidates.data ?? []).filter((item) => item.body?.discoveryConnectionId === row.id && item.body?.status === 'unreviewed').map((item) => item.id);
      if (ids.length) { const result = await db.from('review_candidates').delete().eq('owner_id', userId).in('id', ids); if (result.error) throw result.error; }
      const removed = await db.from('commit_discovery_observations').delete().eq('owner_id', userId).eq('connection_id', row.id);
      if (removed.error) throw removed.error;
      return Response.json({ removedFindings: ids.length }, { headers });
    }
    return new Response('Unknown action', { status: 400, headers });
  } catch { return new Response('Source operation failed', { status: 502, headers }); }
});

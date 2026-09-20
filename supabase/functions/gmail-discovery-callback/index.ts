import { admin, appOrigin, encrypt, required, sha256 } from '../_shared/discovery.ts';

Deno.serve(async (request) => {
  const target = new URL('/discovery', appOrigin());
  if (Deno.env.get('GMAIL_DISCOVERY_ENABLED') !== 'true') { target.searchParams.set('connect', 'failed'); return Response.redirect(target); }
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !/^[0-9a-f]{64}$/.test(state) || !code || code.length > 4096) { target.searchParams.set('connect', 'failed'); return Response.redirect(target); }
  const db = admin();
  const hash = await sha256(state);
  const { data: claim } = await db.from('commit_discovery_oauth_states').update({ used_at: new Date().toISOString() })
    .eq('state_hash', hash).is('used_at', null).gt('expires_at', new Date().toISOString()).select('owner_id').maybeSingle();
  if (!claim) { target.searchParams.set('connect', 'failed'); return Response.redirect(target); }
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: required('GOOGLE_CLIENT_ID'),
        client_secret: required('GOOGLE_CLIENT_SECRET'), redirect_uri: `${required('SUPABASE_URL')}/functions/v1/gmail-discovery-callback`, grant_type: 'authorization_code' }) });
    if (!response.ok) throw new Error('Token exchange failed');
    const token = await response.json();
    if (!token.refresh_token || !String(token.scope || '').includes('gmail.readonly')) throw new Error('Required scope or refresh token missing');
    const profile = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000) });
    if (!profile.ok) throw new Error('Mailbox profile failed');
    const email = (await profile.json()).emailAddress;
    if (typeof email !== 'string' || !email.includes('@')) throw new Error('Mailbox identity missing');
    const secured = await encrypt(token.refresh_token);
    const { error } = await db.from('commit_discovery_connections').upsert({ owner_id: claim.owner_id, provider: 'gmail', external_id: email,
      ...secured, status: 'active', consented_at: new Date().toISOString(), consent_expires_at: null, last_error: null },
      { onConflict: 'owner_id,provider,external_id' });
    if (error) {
      await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: token.refresh_token }), signal: AbortSignal.timeout(10000) }).catch(() => {});
      throw error;
    }
    target.searchParams.set('connect', 'gmail');
  } catch { target.searchParams.set('connect', 'failed'); }
  return Response.redirect(target);
});

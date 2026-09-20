// Private scheduled worker. Set PUSH_WORKER_TOKEN, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, SUPABASE_URL and service-role key.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};
Deno.serve(async (request) => {
  if (request.method !== 'POST' || request.headers.get('authorization') !== `Bearer ${required('PUSH_WORKER_TOKEN')}`)
    return new Response('Unauthorized', { status: 401 });
  if (Deno.env.get('PUSH_DELIVERY_ENABLED') !== 'true') return Response.json({ disabled: true });
  webpush.setVapidDetails(required('VAPID_SUBJECT'), required('VAPID_PUBLIC_KEY'), required('VAPID_PRIVATE_KEY'));
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error } = await client.rpc('claim_commit_push', { p_limit: 20 });
  if (error) return new Response('Could not claim jobs', { status: 500 });
  let accepted = 0, suppressed = 0, failed = 0;
  for (const job of jobs ?? []) {
    const [record, profile, device] = await Promise.all([
      client.from('commitments').select('version,body').eq('owner_id', job.owner_id).eq('id', job.commitment_id).maybeSingle(),
      client.from('commit_profiles').select('settings').eq('owner_id', job.owner_id).maybeSingle(),
      client.from('commit_push_subscriptions').select('endpoint,p256dh,auth_key,revoked_at').eq('owner_id', job.owner_id).eq('id', job.subscription_id).maybeSingle(),
    ]);
    const c = record.data?.body;
    const settings = profile.data?.settings;
    const valid = !record.error && !profile.error && !device.error && device.data && !device.data.revoked_at &&
      settings?.pushEnabled === true && Boolean(settings?.pushConsentAt) &&
      record.data?.version === job.commitment_version && c?.reviewTargetDate === job.action_date &&
      ['review','cancel'].includes(c?.intention) && c?.cancellation !== 'confirmed' &&
      !['draft','canceled','expired'].includes(c?.lifecycle) && job.action_date >= new Date().toISOString().slice(0, 10);
    if (!valid) {
      await client.from('commit_push_jobs').update({ status: 'suppressed', locked_until: null, last_error: 'Current record or consent no longer permits delivery' }).eq('id', job.id).eq('status', 'leased');
      suppressed++; continue;
    }
    try {
      await webpush.sendNotification({ endpoint: device.data.endpoint, keys: { p256dh: device.data.p256dh, auth: device.data.auth_key } },
        JSON.stringify({ type: 'commit-reminder', title: settings.privacyMode ? 'A commitment needs your attention' : `${c.intention === 'cancel' ? 'Cancel' : 'Review'} ${String(c.merchant).slice(0, 60)} by ${job.action_date}`,
          path: `/subscriptions/${encodeURIComponent(job.commitment_id)}`, tag: job.id }), { TTL: 86400 });
      await client.from('commit_push_jobs').update({ status: 'accepted', locked_until: null, last_error: null }).eq('id', job.id).eq('status', 'leased');
      accepted++;
    } catch (caught) {
      const statusCode = (caught as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await client.from('commit_push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', job.subscription_id);
      }
      await client.from('commit_push_jobs').update({ status: job.attempts < 3 && statusCode !== 404 && statusCode !== 410 ? 'queued' : 'failed',
        scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(), locked_until: null,
        last_error: `Push provider ${statusCode || 'error'}` }).eq('id', job.id).eq('status', 'leased');
      failed++;
    }
  }
  return Response.json({ accepted, suppressed, failed });
});

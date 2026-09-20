// Public bearer-token endpoint. Only token hashes are stored; never log URLs or token values.
const headers = { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' };
function line(value: unknown) { return String(value ?? '').replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n').slice(0, 120); }
function date(value: unknown) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '') : null; }
function event(id: string, day: string, title: string) {
  return ['BEGIN:VEVENT', `UID:${line(id)}@commit`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`, `DTSTART;VALUE=DATE:${day}`, `SUMMARY:${line(title)}`, 'END:VEVENT'];
}
Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return new Response('Invalid feed', { status: 404 });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const feed = await admin.from('commit_calendar_feeds').select('owner_id').eq('token_hash', hash).is('revoked_at', null).maybeSingle();
  if (feed.error || !feed.data) return new Response('Feed unavailable', { status: 404 });
  const rows = await admin.from('commitments').select('id,body').eq('owner_id', feed.data.owner_id).limit(1000);
  if (rows.error) return new Response('Feed unavailable', { status: 503 });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Commit//Decision Calendar//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Commit decisions'];
  for (const row of rows.data ?? []) {
    const c = row.body;
    if (!c || c.lifecycle === 'draft' || c.lifecycle === 'canceled' || c.lifecycle === 'expired' || c.cancellation === 'confirmed') continue;
    const merchant = typeof c.merchant === 'string' ? c.merchant : 'Commitment';
    const target = date(c.reviewTargetDate);
    if (target && c.intention !== 'keep') lines.push(...event(`${row.id}-decision-${target}`, target, `${c.intention === 'cancel' ? 'Cancel' : 'Review'}: ${merchant}`));
    const cutoff = date(c.actionCutoffDate);
    if (cutoff) lines.push(...event(`${row.id}-cutoff-${cutoff}`, cutoff, `Merchant cutoff: ${merchant}`));
    const bill = date(c.nextBillDate);
    if (bill) lines.push(...event(`${row.id}-bill-${bill}`, bill, `Projected bill: ${merchant}`));
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', { headers });
});

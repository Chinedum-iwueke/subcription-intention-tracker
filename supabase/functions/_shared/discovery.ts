import { createClient } from 'npm:@supabase/supabase-js@2';

export function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}
export function admin() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const appOrigin = () => new URL(required('APP_URL')).origin;
export function cors(request: Request) {
  return { 'Access-Control-Allow-Origin': appOrigin(), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}
export async function owner(request: Request) {
  const jwt = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await admin().auth.getUser(jwt);
  return error ? null : data.user?.id ?? null;
}
export async function sha256(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((n) => n.toString(16).padStart(2, '0')).join('');
}
export function randomHex(bytes = 32) { return [...crypto.getRandomValues(new Uint8Array(bytes))].map((n) => n.toString(16).padStart(2, '0')).join(''); }
function keyBytes() {
  const hex = required('DISCOVERY_TOKEN_KEY');
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('DISCOVERY_TOKEN_KEY must be 32-byte hex');
  return Uint8Array.from(hex.match(/../g)!, (part) => Number.parseInt(part, 16));
}
export async function encrypt(value: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBytes(), 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(value)));
  return { token_cipher: btoa(String.fromCharCode(...cipher)), token_nonce: btoa(String.fromCharCode(...nonce)) };
}
export async function decrypt(cipher: string, nonce: string) {
  const key = await crypto.subtle.importKey('raw', keyBytes(), 'AES-GCM', false, ['decrypt']);
  const bytes = Uint8Array.from(atob(cipher), (char) => char.charCodeAt(0));
  const iv = Uint8Array.from(atob(nonce), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes));
}
export async function plaid(path: string, body: Record<string, unknown>) {
  const env = required('PLAID_ENV');
  if (!['sandbox', 'development', 'production'].includes(env)) throw new Error('Invalid Plaid environment');
  const response = await fetch(`https://${env}.plaid.com${path}`, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', 'Plaid-Version': '2020-09-14' },
    body: JSON.stringify({ client_id: required('PLAID_CLIENT_ID'), secret: required('PLAID_SECRET'), ...body }) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error_code === 'string' ? result.error_code : `Plaid ${path} returned ${response.status}`);
  return result;
}

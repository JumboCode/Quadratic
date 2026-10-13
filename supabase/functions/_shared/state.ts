// Signed, expiring OAuth `state` values so the Slack callback knows an admin started the flow.
import { env } from './http.ts';

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(env('INTERNAL_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signState(userId: string, ttlSeconds = 600): Promise<string> {
  const data = btoa(JSON.stringify({ u: userId, exp: Date.now() + ttlSeconds * 1000 }));
  return `${data}.${await hmac(data)}`;
}

export async function verifyState(state: string | null): Promise<string | null> {
  if (!state) return null;
  const [data, sig] = state.split('.');
  if (!data || !sig || (await hmac(data)) !== sig) return null;
  const { u, exp } = JSON.parse(atob(data));
  return Date.now() < exp ? u : null;
}

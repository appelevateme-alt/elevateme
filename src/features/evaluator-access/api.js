import { supabase } from '../../lib/supabaseClient.js';

export class AccessError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
// All guest requests use only the restricted HttpOnly cookie. Admin requests use Supabase identity.
export async function accessApi(path, { method = 'GET', body, admin = false, signal } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-ElevateMe-Request': '1' };
  if (admin) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`/api/evaluation-access${path}`, {
    method, headers, credentials: 'same-origin', signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new AccessError(res.status, json?.message || 'The evaluation service is unavailable. Please try again.');
  return json;
}

export const adminApi = (path, options = {}) => accessApi(`/admin${path}`, { ...options, admin: true });
export const deadline = (value) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }) + ' (Sri Lanka)';

// Header doc: client-side fetch wrapper that injects Bearer token from localStorage.
// Throws on non-2xx with parsed JSON message.
'use client';

const TOKEN_KEY = 'spa_crm_token';
const USER_KEY = 'spa_crm_user';

export function setSession(token, user) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, opts = {}) {
  const token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const msg = data?.error || data?.detail || `HTTP ${res.status}`;
    if (res.status === 401) {
      clearSession();
      if (typeof window !== 'undefined' && !location.pathname.startsWith('/login')) {
        location.href = '/login';
      }
    }
    throw new Error(msg);
  }
  return data;
}

export function formatRupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}
export function formatDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
export function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

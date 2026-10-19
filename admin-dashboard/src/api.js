/**
 * Talks to /api/admin on the same server as the public site.
 * Auth: log in with Google (stateful login cookie), then Cloudflare Turnstile is traded for a short-lived
 * access token (lib/access.js). The server only lets through emails listed in ADMIN_EMAILS.
 * A 401 with access_required / access_expired renews the access token in the background and retries once.
 */
import { ensureAccess } from './lib/access.js';
import { BASE_URL } from './config.js';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
  }
}

const NEEDS_ACCESS = new Set(['access_required', 'access_expired']);

async function request(path, { params, method = 'GET', signal, retry = true } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url, { method, signal, credentials: 'include', headers: { Accept: 'application/json' } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.status === 401 && retry && NEEDS_ACCESS.has(body?.error?.code)) {
    await ensureAccess({ force: true });
    return request(path, { params, method, signal, retry: false });
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export const getAuthMe = (signal) => request('/auth/me', { signal }); // { user, access }
export const getAdminMe = (signal) => request('/admin/me', { signal });
export const getOverview = (signal) => request('/admin/overview', { signal });
export const getOnline = (kind, signal) => request('/admin/online', { params: { kind }, signal });
export const getTimeline = (range, signal) => request('/admin/timeline', { params: { range }, signal });
export const getDaily = (days, signal) => request('/admin/daily', { params: { days }, signal });
export const logout = () => request('/auth/logout', { method: 'POST' });

/** After Google login the API sends the browser back to this dashboard. */
export const loginUrl = () =>
  `${BASE_URL}/auth/google?returnTo=${encodeURIComponent(`${window.location.origin}/`)}`;

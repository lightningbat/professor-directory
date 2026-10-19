/**
 * Talks to /api/admin on the same server as the public site. Auth is the same httpOnly cookie
 * session (log in with Google); the server only lets through emails listed in ADMIN_EMAILS.
 */
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
  }
}

let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request(path, { params, method = 'GET', signal, retry = true } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url, { method, signal, credentials: 'include', headers: { Accept: 'application/json' } });

  if (res.status === 401 && retry) {
    await refreshSession(); // quietly swap the expired access token for a new one
    return request(path, { params, method, signal, retry: false });
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export const getAdminMe = (signal) => request('/admin/me', { signal });
export const getAuthMe = (signal) => request('/auth/me', { signal });
export const getOverview = (signal) => request('/admin/overview', { signal });
export const getOnline = (kind, signal) => request('/admin/online', { params: { kind }, signal });
export const getTimeline = (range, signal) => request('/admin/timeline', { params: { range }, signal });
export const getDaily = (days, signal) => request('/admin/daily', { params: { days }, signal });
export const logout = () => request('/auth/logout', { method: 'POST' });

/** After Google login the API sends the browser back to this dashboard. */
export const loginUrl = () =>
  `${BASE_URL}/auth/google?returnTo=${encodeURIComponent(`${window.location.origin}/`)}`;

/**
 * All network access lives in this file. Requests send cookies (credentials: 'include').
 *
 *   GET  /professors?q=&college=&department=&designation=&page=&pageSize=   (public)
 *        -> { data: Professor[], total, page, pageSize }
 *        Professor = { id, name, profileUrl, college, department, designation, emailCount }
 *        profileUrl is a Google search unless the request carries an access token.
 *   POST /professors/:id/email  -> { emails, quota }          (needs an access token)
 *   GET  /filters, GET /stats                                  (public)
 *   GET  /auth/me               -> { user, access: { expiresAt } | null }   (login cookie)
 *   POST /auth/access           -> see lib/access.js           (login cookie + Turnstile token)
 *   GET  /auth/google           -> redirects to Google (full page navigation)
 *   POST /auth/logout
 *
 * "Access token" = logged in AND passed Cloudflare Turnstile in the last few minutes. A 401 with
 * access_required / access_expired makes this file renew it (lib/access.js) and retry once.
 */
import { ensureAccess } from '../lib/access.js';
import { BASE_URL } from './config.js';

export class ApiError extends Error {
  constructor(status, body, retryAfter) {
    super(body?.error?.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.retryAfterSeconds = Number(retryAfter) || body?.error?.retryAfterSeconds || null;
  }
}

const NEEDS_ACCESS = new Set(['access_required', 'access_expired']);

async function request(path, { params, method = 'GET', body: payload, signal, retry = true } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== '' && value != null) url.searchParams.set(key, value);
  });

  const res = await fetch(url, {
    method,
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.status === 401 && retry && NEEDS_ACCESS.has(body?.error?.code)) {
    await ensureAccess({ force: true }); // Turnstile in the background, then try once more
    return request(path, { params, method, body: payload, signal, retry: false });
  }
  if (!res.ok) throw new ApiError(res.status, body, res.headers.get('Retry-After'));
  return body;
}

export const getProfessors = (params, { signal } = {}) => request('/professors', { params, signal });
export const getFilterOptions = ({ signal } = {}) => request('/filters', { signal });
export const getStats = ({ signal } = {}) => request('/stats', { signal });

/** "I'm still here" ping used by the admin dashboard's live visitor count. */
export const sendHeartbeat = (payload) => request('/analytics/heartbeat', { method: 'POST', body: payload });

/** { user, access } for a logged-in browser, or null when nobody is logged in. */
export async function getMe({ signal } = {}) {
  try {
    return await request('/auth/me', { signal });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export const logout = () => request('/auth/logout', { method: 'POST' });

/** Where the "Login" button sends the browser (a full-page redirect, not fetch). */
export const loginUrl = (returnTo = '/') => `${BASE_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

// Emails already revealed in this tab. Showing them again doesn't cost another reveal.
const revealed = new Map();
export const getRevealedEmails = (id) => revealed.get(id);
export const clearRevealedEmails = () => revealed.clear();

export async function revealEmails(id) {
  const result = await request(`/professors/${encodeURIComponent(id)}/email`, { method: 'POST' });
  revealed.set(id, result.emails);
  return result;
}

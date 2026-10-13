/**
 * All network access lives in this file. Requests send cookies (credentials: 'include'), and a
 * 401 triggers one silent refresh-and-retry, so a short-lived access token never logs you out.
 *
 *   GET  /professors?q=&college=&department=&designation=&page=&pageSize=
 *        -> { data: Professor[], total, page, pageSize }
 *        Professor = { id, name, profileUrl, college, department, designation, emailCount }
 *        (logged out: profileUrl is a Google search; emails are never in the list)
 *   POST /professors/:id/email  -> { emails: string[], quota: { hourRemaining, dayRemaining } }
 *   GET  /filters               -> { colleges, departments, designations }
 *   GET  /stats                 -> { professors, universities, departments }
 *   GET  /auth/me               -> { user: { id, email, name, picture } }
 *   GET  /auth/google           -> redirects to Google (full page navigation)
 *   POST /auth/refresh, POST /auth/logout
 */
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body, retryAfter) {
    super(body?.error?.message || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code;
    this.retryAfterSeconds = Number(retryAfter) || body?.error?.retryAfterSeconds || null;
  }
}

// If several requests hit an expired token at once, they share a single refresh call.
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
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== '' && value != null) url.searchParams.set(key, value);
  });

  const res = await fetch(url, {
    method,
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 401 && retry) {
    await refreshSession(); // if it fails the server clears the cookies and the retry is anonymous
    return request(path, { params, method, signal, retry: false });
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body, res.headers.get('Retry-After'));
  return body;
}

export const getProfessors = (params, { signal } = {}) => request('/professors', { params, signal });
export const getFilterOptions = ({ signal } = {}) => request('/filters', { signal });
export const getStats = ({ signal } = {}) => request('/stats', { signal });

export async function getMe({ signal } = {}) {
  try {
    return (await request('/auth/me', { signal })).user;
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

/**
 * Keeps a valid access token in place, so the rest of the app never thinks about it.
 *
 *   - No access token yet (right after landing)    -> run Turnstile in the background, trade it for one
 *   - About 90 s before it expires                  -> do it again, silently
 *   - A request fails with access_required/expired -> do it now and retry (see api/professors.js)
 *   - Tab hidden when renewal is due               -> wait until the person comes back
 *
 * The access token itself is an httpOnly cookie; this file only tracks WHEN it expires.
 * Plain module (not React) so the API layer can use it; React reads it through useSyncExternalStore.
 */
import { BASE_URL } from '../config.js';
import { getTurnstileToken, TurnstileError } from './turnstile.js';

const RENEW_BEFORE_MS = 90_000;
const MIN_RENEW_GAP_MS = 5_000; // never renew in a tight loop, whatever the token lifetime
const RETRY_BACKOFF_MS = [4_000, 12_000, 30_000];

let state = { status: 'idle', expiresAt: null, error: null }; // idle | verifying | ready | renewing | error
let loggedIn = false;
let inflight = null;
let timer = null;
let renewWhenVisible = false;
let sessionLostHandler = null;
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export const subscribeAccess = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getAccessState = () => state;
export const hasValidAccess = (marginMs = 0) => state.expiresAt != null && state.expiresAt - Date.now() > marginMs;

/** Called when the server says the login itself is gone (logged out elsewhere, revoked, expired). */
export function onSessionLost(fn) {
  sessionLostHandler = fn;
}

/** The auth layer tells us whether anyone is logged in; guests never need an access token. */
export function setLoggedIn(value) {
  loggedIn = value;
  if (!value) resetAccess();
}

/** The server says the access cookie we already hold is still good (page reload), so skip Turnstile. */
export function adoptAccess(expiresAt) {
  setState({ status: 'ready', expiresAt, error: null });
  schedule();
}

export function resetAccess() {
  clearTimeout(timer);
  renewWhenVisible = false;
  setState({ status: 'idle', expiresAt: null, error: null });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postAccess(turnstileToken) {
  const res = await fetch(`${BASE_URL}/auth/access`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ turnstileToken }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body?.error?.code;
    throw err;
  }
  return body;
}

// quick = a person asked again after verification already failed through every retry, so give them an
// answer in one attempt instead of another ~45 s of backoff.
async function run(quick) {
  const retries = quick ? 0 : RETRY_BACKOFF_MS.length;
  setState({ status: hasValidAccess() ? 'renewing' : 'verifying', error: null });

  for (let attempt = 0; ; attempt += 1) {
    try {
      const token = await getTurnstileToken();
      const { expiresAt } = await postAccess(token);
      setState({ status: 'ready', expiresAt, error: null });
      schedule();
      return true;
    } catch (err) {
      if (err.status === 401) {
        // Not logged in any more. Not something retrying can fix.
        resetAccess();
        sessionLostHandler?.();
        return false;
      }
      const hopeless = err instanceof TurnstileError && err.code === 'not_configured';
      if (hopeless || attempt >= retries) {
        if (hasValidAccess()) {
          // Renewal failed but the current token still works: carry on and try again shortly.
          setState({ status: 'ready', error: err });
          schedule(20_000);
        } else {
          setState({ status: 'error', error: err });
        }
        return false;
      }
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
}

/** Resolves true when a valid access token is in place. Concurrent callers share one run. */
export function ensureAccess({ force = false } = {}) {
  if (!loggedIn) return Promise.resolve(false);
  if (!force && hasValidAccess(RENEW_BEFORE_MS / 2)) return Promise.resolve(true);
  if (!inflight) {
    inflight = run(state.status === 'error').finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

function schedule(delayMs) {
  clearTimeout(timer);
  // Renew ~90 s before expiry, but scale down for short-lived tokens (a 60 s token can't be renewed
  // "90 s early"; that would mean renewing continuously).
  const remaining = state.expiresAt - Date.now();
  const lead = Math.min(RENEW_BEFORE_MS, remaining / 4);
  const jitter = Math.random() * Math.min(15_000, remaining / 20);
  const delay = delayMs ?? Math.max(MIN_RENEW_GAP_MS, remaining - lead - jitter);
  timer = setTimeout(() => {
    if (document.visibilityState === 'visible') ensureAccess({ force: true });
    else renewWhenVisible = true; // don't burn a challenge in a background tab
  }, delay);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !loggedIn || state.status === 'idle') return;
    if (renewWhenVisible || !hasValidAccess(RENEW_BEFORE_MS)) {
      renewWhenVisible = false;
      ensureAccess({ force: true });
    }
  });
}

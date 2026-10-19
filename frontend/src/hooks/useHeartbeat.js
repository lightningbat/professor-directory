import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sendHeartbeat } from '../api/professors.js';
import { useAuth } from './useAuth.jsx';

const HEARTBEAT_MS = 25_000;
let warned = false;

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function storedId(storage, key) {
  try {
    let id = storage.getItem(key);
    if (!id) {
      id = randomId();
      storage.setItem(key, id);
    }
    return id;
  } catch {
    return randomId(); // storage blocked: still counts, just once per page load
  }
}

/**
 * Tells the server this tab is open and looking at the site, so the admin dashboard can show how
 * many people are online. Random ids only (no personal data): one per browser, one per tab.
 * Beats pause while the tab is hidden, so background tabs drop out of the "online now" number.
 */
export function useHeartbeat() {
  const { pathname } = useLocation();
  const { status, user, hasAccess, accessSettled } = useAuth();
  // "Signed in" on the server means a valid access token, so classify only once Turnstile has settled.
  const viewer = `${user?.id ?? 'guest'}:${hasAccess ? 'access' : 'none'}`;

  useEffect(() => {
    if (status !== 'ready' || !accessSettled) return undefined; // wait until we know who they are

    const visitorId = storedId(localStorage, 'vid');
    const sessionId = storedId(sessionStorage, 'sid');
    let timer;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      // Never bother the user, but leave one hint in the console for whoever is debugging.
      sendHeartbeat({ visitorId, sessionId, path: pathname }).catch((err) => {
        if (warned) return;
        warned = true;
        console.debug(
          '[heartbeat] request failed. An ad blocker, a wrong VITE_API_URL or a proxy not forwarding /api/ can cause this.',
          err,
        );
      });
    };
    const start = () => {
      clearInterval(timer);
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : clearInterval(timer));

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pathname, status, accessSettled, viewer]);
}

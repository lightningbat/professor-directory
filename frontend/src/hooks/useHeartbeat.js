import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { sendHeartbeat } from '../api/professors.js';
import { useAuth } from './useAuth.jsx';

const HEARTBEAT_MS = 25_000;

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
  const { status, user } = useAuth();
  const viewer = user?.id ?? 'guest';

  useEffect(() => {
    if (status !== 'ready') return undefined; // wait until we know if they're signed in

    const visitorId = storedId(localStorage, 'vid');
    const sessionId = storedId(sessionStorage, 'sid');
    let timer;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      sendHeartbeat({ visitorId, sessionId, path: pathname }).catch(() => {}); // never bother the user
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
  }, [pathname, status, viewer]);
}

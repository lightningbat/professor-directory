import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { clearRevealedEmails, getMe, loginUrl, logout as apiLogout } from '../api/professors.js';
import {
  adoptAccess, ensureAccess, getAccessState, onSessionLost, resetAccess, setLoggedIn, subscribeAccess,
} from '../lib/access.js';

const AuthContext = createContext(null);

const ERROR_TEXT = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'That sign-in attempt expired. Please try again.',
  invalid_request: 'Something went wrong during sign-in. Please try again.',
  google_failed: 'We couldn’t complete sign-in with Google. Please try again.',
  email_unverified: 'Your Google email isn’t verified, so we can’t sign you in.',
};

function readAuthError() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_error');
  if (!code) return null;
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return ERROR_TEXT[code] || 'Sign-in failed. Please try again.';
}

/**
 * "user" comes from the stateful login cookie (GET /auth/me). "access" is the short-lived,
 * Turnstile-backed token that unlocks emails and direct profile links; it is obtained and renewed
 * in the background by lib/access.js, so visitors never see a CAPTCHA unless Cloudflare insists.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, status: 'loading' });
  const [authError, setAuthError] = useState(readAuthError);
  const access = useSyncExternalStore(subscribeAccess, getAccessState);

  useEffect(() => {
    const controller = new AbortController();
    getMe({ signal: controller.signal })
      .then((me) => {
        if (controller.signal.aborted) return;
        setLoggedIn(Boolean(me?.user));
        setState({ user: me?.user ?? null, status: 'ready' });
        if (!me?.user) return;
        // Reloaded within the access token's lifetime: reuse it. Otherwise verify in the background.
        if (me.access?.expiresAt && me.access.expiresAt - Date.now() > 60_000) adoptAccess(me.access.expiresAt);
        else ensureAccess();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ user: null, status: 'ready' });
      });
    return () => controller.abort();
  }, []);

  // The login was revoked or expired while the page was open.
  useEffect(() => {
    onSessionLost(() => {
      clearRevealedEmails();
      setState({ user: null, status: 'ready' });
    });
  }, []);

  const login = useCallback(() => {
    window.location.assign(loginUrl(window.location.pathname));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setLoggedIn(false);
      resetAccess();
      clearRevealedEmails();
      setState({ user: null, status: 'ready' });
    }
  }, []);

  const retryAccess = useCallback(() => ensureAccess({ force: true }), []);

  const value = useMemo(() => {
    const hasAccess = (access.status === 'ready' || access.status === 'renewing') && access.expiresAt != null;
    return {
      ...state,
      access,
      hasAccess,
      // Logged-out visitors have nothing to verify. Logged-in ones are "settled" once Turnstile has finished.
      accessSettled: !state.user || access.status === 'ready' || access.status === 'error',
      authError,
      dismissAuthError: () => setAuthError(null),
      login,
      logout,
      retryAccess,
    };
  }, [state, access, authError, login, logout, retryAccess]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

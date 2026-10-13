import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearRevealedEmails, getMe, loginUrl, logout as apiLogout } from '../api/professors.js';

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

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, status: 'loading' });
  const [authError, setAuthError] = useState(readAuthError);

  useEffect(() => {
    const controller = new AbortController();
    getMe({ signal: controller.signal })
      .then((user) => setState({ user, status: 'ready' }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ user: null, status: 'ready' });
      });
    return () => controller.abort();
  }, []);

  const login = useCallback(() => {
    window.location.assign(loginUrl(window.location.pathname));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      clearRevealedEmails();
      setState({ user: null, status: 'ready' });
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, authError, dismissAuthError: () => setAuthError(null), login, logout }),
    [state, authError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

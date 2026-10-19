import { useCallback, useEffect, useState } from 'react';
import { ApiError, getAdminMe, getAuthMe, getOverview, logout } from './api.js';
import { adoptAccess, ensureAccess, getAccessState, onSessionLost, resetAccess, setLoggedIn } from './lib/access.js';
import DailyChart from './components/DailyChart.jsx';
import { ErrorScreen, ForbiddenScreen, LoadingScreen, LoginScreen } from './components/Gate.jsx';
import LiveCard from './components/LiveCard.jsx';
import PagesNow from './components/PagesNow.jsx';
import SessionsTable from './components/SessionsTable.jsx';
import StatGrid from './components/StatGrid.jsx';
import TimelineChart from './components/TimelineChart.jsx';
import Topbar from './components/Topbar.jsx';
import { usePolling } from './hooks/usePolling.js';

function Dashboard({ user, onLogout, onAuthLost }) {
  const { data: overview, error, updatedAt } = usePolling((signal) => getOverview(signal), 5_000, []);

  // The session can expire or be revoked while the page is open.
  useEffect(() => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) onAuthLost();
  }, [error, onAuthLost]);

  return (
    <div className="dash">
      <Topbar user={user} onLogout={onLogout} />
      <main>
        <div className="row row--hero">
          <LiveCard overview={overview} error={error} updatedAt={updatedAt} />
          <PagesNow pages={overview?.pages} />
        </div>
        <StatGrid overview={overview} />
        <TimelineChart />
        <DailyChart />
        <SessionsTable />
      </main>
    </div>
  );
}

const AUTH_ERRORS = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'The sign-in attempt expired or its cookie was lost. Please try again.',
  invalid_request: 'Something went wrong during sign-in. Please try again.',
  google_failed: 'Google sign-in failed. Check the API logs.',
  email_unverified: 'That Google account’s email isn’t verified.',
};

/** Reads (and removes) ?auth_error=... that the API adds when a login fails. */
function takeAuthError() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('auth_error');
  if (!code) return null;
  url.searchParams.delete('auth_error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  return AUTH_ERRORS[code] || 'Sign-in failed. Please try again.';
}

export default function App() {
  const [gate, setGate] = useState({ status: 'loading' });
  const [authError] = useState(takeAuthError);

  const check = useCallback(async () => {
    setGate({ status: 'loading' });
    let who = null;
    try {
      const me = await getAuthMe(); // who is logged in (401 = nobody)
      who = me.user;
      setLoggedIn(true);

      // The admin API needs an access token: reuse one if the server says it's still valid, otherwise
      // run Cloudflare Turnstile (usually invisible) and trade it for one.
      if (me.access?.expiresAt && me.access.expiresAt - Date.now() > 60_000) {
        adoptAccess(me.access.expiresAt);
      } else {
        setGate({ status: 'verifying' });
        if (!(await ensureAccess({ force: true }))) {
          const { status, error } = getAccessState();
          return setGate(
            status === 'idle'
              ? { status: 'login' } // the login itself was lost meanwhile
              : { status: 'error', message: error?.message || 'Human verification failed.' },
          );
        }
      }

      const { user } = await getAdminMe();
      setGate({ status: 'ready', user });
    } catch (err) {
      if (err.status === 401) return setGate({ status: 'login' });
      if (err.status === 403) return setGate({ status: 'forbidden', user: who });
      return setGate({ status: 'error', message: err.message });
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // The login was revoked or expired while the dashboard was open.
  useEffect(() => { onSessionLost(() => setGate({ status: 'login' })); }, []);

  const doLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      setLoggedIn(false);
      resetAccess();
      setGate({ status: 'login' });
    }
  }, []);

  switch (gate.status) {
    case 'loading': return <LoadingScreen />;
    case 'verifying': return <LoadingScreen text="Verifying you’re human…" />;
    case 'login': return <LoginScreen error={authError} />;
    case 'forbidden': return <ForbiddenScreen user={gate.user} onLogout={doLogout} />;
    case 'error': return <ErrorScreen message={gate.message} onRetry={check} />;
    default: return <Dashboard user={gate.user} onLogout={doLogout} onAuthLost={check} />;
  }
}

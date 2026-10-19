import { useCallback, useEffect, useState } from 'react';
import { ApiError, getAdminMe, getAuthMe, getOverview, logout } from './api.js';
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

export default function App() {
  const [gate, setGate] = useState({ status: 'loading' });

  const check = useCallback(async () => {
    setGate({ status: 'loading' });
    try {
      const { user } = await getAdminMe();
      setGate({ status: 'ready', user });
    } catch (err) {
      if (err.status === 401) return setGate({ status: 'login' });
      if (err.status === 403) {
        const who = await getAuthMe().then((r) => r.user).catch(() => null);
        return setGate({ status: 'forbidden', user: who });
      }
      return setGate({ status: 'error', message: err.message });
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const doLogout = useCallback(async () => {
    try { await logout(); } finally { setGate({ status: 'login' }); }
  }, []);

  switch (gate.status) {
    case 'loading': return <LoadingScreen />;
    case 'login': return <LoginScreen />;
    case 'forbidden': return <ForbiddenScreen user={gate.user} onLogout={doLogout} />;
    case 'error': return <ErrorScreen message={gate.message} onRetry={check} />;
    default: return <Dashboard user={gate.user} onLogout={doLogout} onAuthLost={check} />;
  }
}

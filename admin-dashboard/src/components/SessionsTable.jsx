import { useState } from 'react';
import { getOnline } from '../api.js';
import { fmtAgo, fmtDuration } from '../format.js';
import { usePolling } from '../hooks/usePolling.js';
import { useNow } from '../hooks/useNow.js';
import Segmented from './Segmented.jsx';

const KINDS = [
  { id: 'all', label: 'Everyone' },
  { id: 'user', label: 'Signed in' },
  { id: 'guest', label: 'Guests' },
];

function Who({ s }) {
  if (s.kind === 'guest') {
    return (
      <div className="who">
        <span className="avatar avatar--guest" aria-hidden="true">G</span>
        <div><strong>Guest</strong><span className="muted mono">{s.visitorId.slice(0, 8)}</span></div>
      </div>
    );
  }
  const u = s.user;
  const label = u?.name || u?.email || 'Signed-in user';
  return (
    <div className="who">
      {u?.picture ? (
        <img src={u.picture} alt="" width="30" height="30" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar" aria-hidden="true">{label[0]?.toUpperCase()}</span>
      )}
      <div><strong>{label}</strong>{u?.name && u?.email && <span className="muted">{u.email}</span>}</div>
    </div>
  );
}

export default function SessionsTable() {
  const [kind, setKind] = useState('all');
  const { data, error, updatedAt } = usePolling((s) => getOnline(kind, s), 5_000, [kind]);
  const now = useNow(1000);
  const sessions = data?.sessions ?? [];
  // Measure ages against the server's clock at fetch time, so a wrong laptop clock can't skew them.
  const sinceFetch = updatedAt ? now - updatedAt : 0;

  return (
    <section className="panel" aria-label="People online right now">
      <div className="section-head">
        <div>
          <h2>Live sessions</h2>
          <p className="muted panel-sub">One row per open tab · refreshes every 5 seconds</p>
        </div>
        <Segmented label="Show" options={KINDS} value={kind} onChange={setKind} />
      </div>

      {error && !data ? (
        <p className="empty">Couldn’t load sessions.</p>
      ) : sessions.length === 0 ? (
        <p className="empty">No one is online{kind !== 'all' ? ' in this group' : ''} right now.</p>
      ) : (
        <div className="table-wrap table-wrap--scroll">
          <table>
            <thead>
              <tr><th>Who</th><th>Page</th><th>On site for</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td><Who s={s} /></td>
                  <td><code>{s.path}</code></td>
                  <td>{fmtDuration(data.generatedAt - s.firstSeen + sinceFetch)}</td>
                  <td className="muted">{fmtAgo(data.generatedAt - s.lastSeen + sinceFetch)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

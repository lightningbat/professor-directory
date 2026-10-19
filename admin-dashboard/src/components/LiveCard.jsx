import { useNow } from '../hooks/useNow.js';
import { fmtDuration, fmtNumber } from '../format.js';

export default function LiveCard({ overview, error, updatedAt }) {
  const now = useNow(1000);
  const online = overview?.online;
  const total = online?.visitors ?? 0;
  const signedPct = total ? (online.signedIn / total) * 100 : 0;
  const stale = error || (updatedAt && now - updatedAt > 20_000);

  return (
    <section className="panel live" aria-label="People online now">
      <div className="live-head">
        <span className={`live-dot ${stale ? 'is-stale' : ''}`} aria-hidden="true" />
        <h2>Online now</h2>
        <span className="live-status muted" role="status">
          {stale ? 'Connection lost, retrying…' : updatedAt ? `Updated ${fmtDuration(now - updatedAt)} ago` : 'Loading…'}
        </span>
      </div>

      <p className="live-number" aria-live="polite">{online ? fmtNumber(total) : '–'}</p>
      <p className="muted live-caption">
        {total === 1 ? 'person' : 'people'} using the site
        {overview && <> · active in the last {overview.onlineWindowSeconds}s</>}
      </p>

      <div className="split" aria-hidden="true">
        <span className="split-user" style={{ width: `${signedPct}%` }} />
        <span className="split-guest" style={{ width: `${total ? 100 - signedPct : 0}%` }} />
      </div>
      <dl className="split-legend">
        <div><dt><i className="key key--user" />Signed in</dt><dd>{fmtNumber(online?.signedIn)}</dd></div>
        <div><dt><i className="key key--guest" />Guests</dt><dd>{fmtNumber(online?.guests)}</dd></div>
        <div><dt><i className="key key--tab" />Open tabs</dt><dd>{fmtNumber(online?.sessions)}</dd></div>
      </dl>
    </section>
  );
}

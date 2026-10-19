import { fmtDay, fmtNumber } from '../format.js';

export default function StatGrid({ overview }) {
  const t = overview?.today;
  const items = [
    { label: 'Unique visitors', value: t?.uniqueVisitors, hint: 'distinct browsers today' },
    { label: 'Signed in', value: t?.signedIn, hint: 'of those, logged in', tone: 'user' },
    { label: 'Guests', value: t?.guests, hint: 'of those, not logged in', tone: 'guest' },
    { label: 'Visits', value: t?.sessions, hint: 'tabs opened today' },
    { label: 'Peak online', value: t?.peakOnline, hint: 'most at the same time' },
    { label: 'New sign-ups', value: t?.newUsers, hint: 'first Google login today' },
    { label: 'Email reveals', value: overview?.reveals24h, hint: 'last 24 hours' },
    { label: 'Registered users', value: overview?.totals?.users, hint: 'all time' },
  ];

  return (
    <section aria-label="Today">
      <div className="section-head">
        <h2>Today</h2>
        {t && <span className="muted">{fmtDay(t.day, true)} · {overview.timezone}</span>}
      </div>
      <div className="stats">
        {items.map((i) => (
          <div key={i.label} className={`stat ${i.tone ? `stat--${i.tone}` : ''}`}>
            <span className="stat-label">{i.label}</span>
            <span className="stat-value">{i.value == null ? '–' : fmtNumber(i.value)}</span>
            <span className="stat-hint">{i.hint}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

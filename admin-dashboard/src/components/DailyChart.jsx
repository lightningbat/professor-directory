import { useState } from 'react';
import { getDaily } from '../api.js';
import { fmtDay, fmtNumber, niceScale } from '../format.js';
import { usePolling } from '../hooks/usePolling.js';
import { useWidth } from '../hooks/useWidth.js';
import Segmented from './Segmented.jsx';

const OPTIONS = [
  { id: '14', label: '14 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
];
const H = 240;
const M = { l: 38, r: 8, t: 12, b: 26 };

export default function DailyChart() {
  const [days, setDays] = useState('30');
  const { data, error, loading } = usePolling((s) => getDaily(days, s), 60_000, [days]);
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const rows = data && data.days.length === Number(days) ? data.days : [];
  const innerW = Math.max(0, width - M.l - M.r);
  const innerH = H - M.t - M.b;
  const slot = rows.length ? innerW / rows.length : 0;
  const barW = Math.max(2, slot - Math.min(4, slot * 0.25));
  const scale = niceScale(rows.reduce((m, r) => Math.max(m, r.uniqueVisitors), 0));
  const y = (v) => M.t + innerH - (v / scale.top) * innerH;
  const labelEvery = Math.ceil(rows.length / 7) || 1;

  const hovered = hover == null ? null : rows[hover];
  const total = rows.reduce((n, r) => n + r.uniqueVisitors, 0);

  return (
    <section className="panel" aria-label="Visitors per day">
      <div className="section-head">
        <div>
          <h2>Visitors per day</h2>
          <p className="muted panel-sub">
            {rows.length ? <>{fmtNumber(total)} visitor-days in this period</> : 'Distinct browsers per day'}
            {data && <> · days in {data.timezone}</>}
          </p>
        </div>
        <Segmented label="Period" options={OPTIONS} value={days} onChange={setDays} />
      </div>

      <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label="Bar chart of unique visitors per day, split into signed in and guests">
            {scale.ticks.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} className="grid" />
                <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const bx = M.l + i * slot + (slot - barW) / 2;
              return (
                <g key={r.day} onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)}>
                  <rect x={M.l + i * slot} y={M.t} width={slot} height={innerH} fill="transparent" />
                  <rect x={bx} y={y(r.uniqueVisitors)} width={barW} height={y(r.signedIn) - y(r.uniqueVisitors)} className={`fill-guest ${hover === i ? 'is-hover' : ''}`} />
                  <rect x={bx} y={y(r.signedIn)} width={barW} height={y(0) - y(r.signedIn)} className={`fill-user ${hover === i ? 'is-hover' : ''}`} />
                  {i % labelEvery === 0 && (
                    <text x={bx + barW / 2} y={H - 6} textAnchor="middle" className="axis">{fmtDay(r.day)}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {hovered && (
          <div className="tooltip" style={{ left: Math.min(Math.max(M.l + hover * slot + slot / 2, 80), width - 80) }}>
            <strong>{fmtDay(hovered.day, true)}</strong>
            <span>{hovered.uniqueVisitors} visitors</span>
            <span><i className="key key--user" />{hovered.signedIn} signed in</span>
            <span><i className="key key--guest" />{hovered.guests} guests</span>
            <span>{hovered.sessions} visits · {hovered.newUsers} new sign-ups</span>
          </div>
        )}

        {!loading && error && !rows.length && <p className="chart-empty">Couldn’t load daily numbers.</p>}
      </div>

      <p className="legend">
        <span><i className="key key--user" />Signed in</span>
        <span><i className="key key--guest" />Guests</span>
      </p>

      {rows.length > 0 && (
        <details className="table-toggle">
          <summary>Show numbers</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Day</th><th>Visitors</th><th>Signed in</th><th>Guests</th><th>Visits</th><th>New sign-ups</th></tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.day}>
                    <td>{fmtDay(r.day, true)}</td>
                    <td>{fmtNumber(r.uniqueVisitors)}</td>
                    <td>{fmtNumber(r.signedIn)}</td>
                    <td>{fmtNumber(r.guests)}</td>
                    <td>{fmtNumber(r.sessions)}</td>
                    <td>{fmtNumber(r.newUsers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

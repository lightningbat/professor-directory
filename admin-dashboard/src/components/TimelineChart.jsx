import { useState } from 'react';
import { getTimeline } from '../api.js';
import { fmtAxisTime, fmtDateTime, niceScale } from '../format.js';
import { usePolling } from '../hooks/usePolling.js';
import { useWidth } from '../hooks/useWidth.js';
import Segmented from './Segmented.jsx';

const RANGES = [
  { id: '24h', label: '24 hours', ms: 24 * 3600e3 },
  { id: '7d', label: '7 days', ms: 7 * 24 * 3600e3 },
  { id: '30d', label: '30 days', ms: 30 * 24 * 3600e3 },
];
const H = 260;
const M = { l: 38, r: 12, t: 12, b: 26 };

export default function TimelineChart() {
  const [range, setRange] = useState('24h');
  const { data, error, loading } = usePolling((s) => getTimeline(range, s), 30_000, [range]);
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const cfg = RANGES.find((r) => r.id === range);
  const ready = data?.range === range; // don't draw the old range while the new one loads
  const points = ready ? data.points : [];
  const bucketMs = (data?.bucketSeconds ?? 300) * 1000;

  const innerW = Math.max(0, width - M.l - M.r);
  const innerH = H - M.t - M.b;
  const end = Math.ceil(Date.now() / bucketMs) * bucketMs;
  const start = end - cfg.ms;
  const x = (t) => M.l + ((t - start) / (end - start)) * innerW;
  const peakPoint = points.reduce((best, p) => (!best || p.visitors > best.visitors ? p : best), null);
  const scale = niceScale(peakPoint?.visitors ?? 0);
  const y = (v) => M.t + innerH - (v / scale.top) * innerH;
  const bw = Math.max(2, x(start + bucketMs) - x(start) - 1);

  // Break the line where the server wasn't recording (e.g. it was down).
  const runs = [];
  let current = [];
  for (const p of points) {
    const last = current[current.length - 1];
    if (last && p.t - last.t > bucketMs * 2.5) { runs.push(current); current = []; }
    current.push(p);
  }
  if (current.length) runs.push(current);

  const area = (run, top, bottom) =>
    `M${run.map((p) => `${x(p.t)},${y(top(p))}`).join('L')}L${[...run].reverse().map((p) => `${x(p.t)},${y(bottom(p))}`).join('L')}Z`;
  const line = (run) => `M${run.map((p) => `${x(p.t)},${y(p.visitors)}`).join('L')}`;

  const onMove = (e) => {
    if (!points.length) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHover(points.reduce((best, p) => (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px) ? p : best), points[0]));
  };

  const tickCount = width < 520 ? 3 : 5; // fewer labels on phones so they don't collide
  const xTicks = Array.from({ length: tickCount }, (_, i) => start + ((end - start) * i) / (tickCount - 1));

  return (
    <section className="panel" aria-label="Online over time">
      <div className="section-head">
        <div>
          <h2>People online over time</h2>
          <p className="muted panel-sub">
            {peakPoint ? <>Peak {peakPoint.visitors} around {fmtDateTime(peakPoint.t)}</> : 'Busiest moment in each time slot'}
          </p>
        </div>
        <Segmented label="Time range" options={RANGES} value={range} onChange={setRange} />
      </div>

      <div ref={ref} className="chart" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label="Stacked area chart of signed-in and guest visitors online" onPointerMove={onMove}>
            {scale.ticks.map((v) => (
              <g key={v}>
                <line x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} className="grid" />
                <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text key={t} x={x(t)} y={H - 6} className="axis" textAnchor={i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle'}>
                {fmtAxisTime(t, range)}
              </text>
            ))}

            {runs.map((run) =>
              run.length === 1 ? (
                <g key={run[0].t}>
                  <rect x={x(run[0].t)} y={y(run[0].visitors)} width={bw} height={y(run[0].signedIn) - y(run[0].visitors)} className="fill-guest" />
                  <rect x={x(run[0].t)} y={y(run[0].signedIn)} width={bw} height={y(0) - y(run[0].signedIn)} className="fill-user" />
                </g>
              ) : (
                <g key={run[0].t}>
                  <path d={area(run, (p) => p.visitors, (p) => p.signedIn)} className="fill-guest" />
                  <path d={area(run, (p) => p.signedIn, () => 0)} className="fill-user" />
                  <path d={line(run)} className="stroke-total" fill="none" />
                </g>
              ),
            )}

            {hover && (
              <g>
                <line x1={x(hover.t)} x2={x(hover.t)} y1={M.t} y2={M.t + innerH} className="cursor" />
                <circle cx={x(hover.t)} cy={y(hover.visitors)} r="4" className="dot" />
              </g>
            )}
          </svg>
        )}

        {hover && (
          <div className="tooltip" style={{ left: Math.min(Math.max(x(hover.t), 80), width - 80) }}>
            <strong>{fmtDateTime(hover.t)}</strong>
            <span>{hover.visitors} online</span>
            <span><i className="key key--user" />{hover.signedIn} signed in</span>
            <span><i className="key key--guest" />{hover.guests} guests</span>
          </div>
        )}

        {!loading && !error && points.length === 0 && (
          <p className="chart-empty">No data in this range yet. The server records a snapshot every minute.</p>
        )}
        {error && !points.length && <p className="chart-empty">Couldn’t load the timeline.</p>}
      </div>

      <p className="legend">
        <span><i className="key key--user" />Signed in</span>
        <span><i className="key key--guest" />Guests</span>
      </p>
    </section>
  );
}

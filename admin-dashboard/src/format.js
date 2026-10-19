export const fmtNumber = (n) => new Intl.NumberFormat('en-US').format(n ?? 0);

/** 75000 -> "1m 15s" */
export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export const fmtAgo = (ms) => (ms < 1500 ? 'just now' : `${fmtDuration(ms)} ago`);

/** Axis scale with whole-number ticks: { top, ticks } */
export function niceScale(maxValue, wanted = 4) {
  const max = Math.max(maxValue, 1);
  const raw = max / wanted;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, Math.ceil([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)));
  const top = step * Math.ceil(max / step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

export function fmtAxisTime(ts, range) {
  const d = new Date(ts);
  if (range === '24h') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (range === '7d') return d.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "2026-10-13" -> "13 Oct" (day keys are calendar dates, so no timezone shifting). */
export function fmtDay(key, long = false) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString([], {
    timeZone: 'UTC', day: 'numeric', month: 'short', ...(long ? { weekday: 'short', year: 'numeric' } : {}),
  });
}

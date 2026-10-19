import { fmtNumber } from '../format.js';

export default function PagesNow({ pages = [] }) {
  const max = Math.max(1, ...pages.map((p) => p.visitors));

  return (
    <section className="panel" aria-label="Pages being viewed">
      <h2>Where they are</h2>
      <p className="muted panel-sub">Pages open right now</p>
      {pages.length === 0 ? (
        <p className="empty">Nobody online.</p>
      ) : (
        <ul className="bars">
          {pages.map((p) => (
            <li key={p.path}>
              <div className="bars-row">
                <code>{p.path}</code>
                <span>{fmtNumber(p.visitors)}</span>
              </div>
              <div className="bars-track"><span style={{ width: `${(p.visitors / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

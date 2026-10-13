// Stationery props drawn as inline SVG. Purely decorative: aria-hidden, no pointer events.

export function Pencil({ className = '' }) {
  return (
    <svg className={`prop ${className}`} viewBox="0 0 48 300" aria-hidden="true">
      <defs>
        <linearGradient id="pc-body" x1="0" x2="1">
          <stop offset="0" stopColor="#dd8f26" />
          <stop offset=".42" stopColor="#f7c566" />
          <stop offset="1" stopColor="#d3821b" />
        </linearGradient>
        <linearGradient id="pc-metal" x1="0" x2="1">
          <stop offset="0" stopColor="#8d9094" />
          <stop offset=".45" stopColor="#e6e8ea" />
          <stop offset="1" stopColor="#7b7e82" />
        </linearGradient>
      </defs>
      <rect x="7" y="0" width="34" height="24" rx="9" fill="#333" />
      <rect x="5" y="20" width="38" height="40" fill="url(#pc-metal)" />
      <path d="M5 29h38M5 36h38M5 43h38M5 50h38" stroke="#6b6e72" strokeWidth="1.2" opacity=".55" />
      <rect x="7" y="60" width="34" height="168" fill="url(#pc-body)" />
      <path d="M7 228h34L24 292Z" fill="#ecd0a6" />
      <path d="M7 228h34L36 246H12Z" fill="#dfbb88" opacity=".6" />
      <path d="M18 266h12l-6 26Z" fill="#2b2b2b" />
    </svg>
  );
}

export function BinderClip({ className = '' }) {
  return (
    <svg className={`prop ${className}`} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="bc-body" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#b23a24" />
          <stop offset="1" stopColor="#7e2314" />
        </linearGradient>
      </defs>
      <rect x="22" y="42" width="78" height="66" rx="6" fill="#f0a65a" />
      <rect x="22" y="42" width="78" height="46" rx="6" fill="url(#bc-body)" />
      <path d="M30 42C18 22 6 12 20 6c14-5 34 20 38 36M72 42c8-22 26-34 34-26 8 8-14 22-24 26" fill="none" stroke="#8a8c8f" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Eraser({ className = '' }) {
  return (
    <svg className={`prop ${className}`} viewBox="0 0 60 100" aria-hidden="true">
      <defs>
        <linearGradient id="er-body" x1="0" x2="1">
          <stop offset="0" stopColor="#f08a55" />
          <stop offset="1" stopColor="#d9693a" />
        </linearGradient>
      </defs>
      <rect x="6" y="4" width="48" height="92" rx="9" fill="url(#er-body)" />
    </svg>
  );
}

export function Pin({ className = '' }) {
  return (
    <svg className={`prop ${className}`} viewBox="0 0 140 90" aria-hidden="true">
      <path d="M26 24 128 78l-8 4L18 30Z" fill="#000" opacity=".16" />
      <circle cx="20" cy="20" r="13" fill="#ee9358" />
      <circle cx="16" cy="16" r="5" fill="#f9c39c" opacity=".8" />
    </svg>
  );
}

export function Paperclip({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 20 64" aria-hidden="true">
      <path
        d="M14 12v34a6 6 0 0 1-12 0V10a8 8 0 0 1 16 0v38a10 10 0 0 1-20 0"
        transform="translate(1 4) scale(.9)"
        fill="none"
        stroke="#8f979a"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

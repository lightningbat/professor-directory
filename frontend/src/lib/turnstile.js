/**
 * Cloudflare Turnstile, run in the background. One hidden widget, reused for every check.
 * "interaction-only" means the widget stays invisible unless Cloudflare decides it needs the person
 * to click something; only then does the little "confirm you're human" box appear.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const QUIET_TIMEOUT_MS = 30_000; // an invisible check should finish well within this
const INTERACTIVE_TIMEOUT_MS = 180_000; // longer once a person has to do something

export class TurnstileError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'TurnstileError';
    this.code = code;
  }
}

let scriptPromise = null;
let widgetId = null;
let box = null;
let mount = null;
let pending = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () =>
        window.turnstile ? resolve(window.turnstile) : reject(new TurnstileError('load_failed', 'Turnstile did not initialise'));
      script.onerror = () => {
        scriptPromise = null; // allow a later retry
        reject(new TurnstileError('load_failed', 'Could not load Cloudflare Turnstile (blocked by an extension or network?)'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function ensureDom() {
  if (box) return;
  box = document.createElement('div');
  box.className = 'human-check';
  box.dataset.interactive = 'false';
  const label = document.createElement('span');
  label.textContent = 'Quick check: please confirm you’re human';
  mount = document.createElement('div');
  box.append(label, mount);
  document.body.appendChild(box);
}

const setInteractive = (on) => {
  if (box) box.dataset.interactive = on ? 'true' : 'false';
};

function arm(p, ms) {
  clearTimeout(p.timer);
  p.timer = setTimeout(() => settle(p, new TurnstileError('timeout', 'Turnstile timed out')), ms);
}

/** Finish a pending request exactly once, with a token (string) or an error. */
function settle(p, result) {
  if (!p || pending !== p) return;
  clearTimeout(p.timer);
  pending = null;
  setInteractive(false);
  if (result instanceof Error) p.reject(result);
  else p.resolve(result);
}

async function run(p) {
  const turnstile = await loadScript();
  ensureDom();
  arm(p, QUIET_TIMEOUT_MS);

  if (widgetId == null) {
    widgetId = turnstile.render(mount, {
      sitekey: SITE_KEY,
      action: 'access', // the server insists on this, so tokens from other widgets can't be replayed here
      execution: 'execute',
      appearance: 'interaction-only',
      theme: 'auto',
      retry: 'never', // our own retry loop (with backoff) handles failures
      'response-field': false,
      callback: (token) => settle(pending, token),
      'error-callback': (code) => {
        settle(pending, new TurnstileError('widget_error', `Turnstile error ${code}`));
        return true; // handled; keep the console quiet
      },
      'expired-callback': () => settle(pending, new TurnstileError('expired', 'Turnstile token expired')),
      'timeout-callback': () => settle(pending, new TurnstileError('timeout', 'Turnstile challenge timed out')),
      'before-interactive-callback': () => {
        setInteractive(true);
        if (pending) arm(pending, INTERACTIVE_TIMEOUT_MS);
      },
      'after-interactive-callback': () => setInteractive(false),
    });
  } else {
    turnstile.reset(widgetId); // tokens are single-use, so every check starts from a clean widget
  }
  turnstile.execute(widgetId);
}

/** Resolves with a fresh Turnstile token. Concurrent callers share one run. */
export function getTurnstileToken() {
  if (!SITE_KEY) {
    return Promise.reject(new TurnstileError('not_configured', 'VITE_TURNSTILE_SITE_KEY is not set'));
  }
  if (pending) return pending.promise;

  const p = {};
  p.promise = new Promise((resolve, reject) => {
    p.resolve = resolve;
    p.reject = reject;
  });
  pending = p;
  run(p).catch((err) => settle(p, err instanceof Error ? err : new TurnstileError('widget_error', String(err))));
  return p.promise;
}

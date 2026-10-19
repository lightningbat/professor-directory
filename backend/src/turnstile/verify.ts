import { randomUUID } from 'node:crypto';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { ok: true }
  /** rejected: the token is not valid (bot, expired, reused). unavailable: we couldn't ask Cloudflare. */
  | { ok: false; reason: 'rejected' | 'unavailable'; codes: string[] };

export interface TurnstileVerifier {
  verify(token: string, remoteIp?: string): Promise<TurnstileResult>;
}

interface Options {
  secret: string;
  allowedHostnames: string[];
  action: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

// Cloudflare's published dummy secrets (always pass / always fail / already spent). Their responses
// don't carry our hostname or action, so those two checks are skipped for them. Dev only.
const DUMMY_SECRET = /^[123]x0+AA$/;

const unavailable = (codes: string[]): TurnstileResult => ({ ok: false, reason: 'unavailable', codes });
const rejected = (codes: string[]): TurnstileResult => ({ ok: false, reason: 'rejected', codes });

/**
 * Server-side Turnstile validation. The token from the browser means nothing until Cloudflare confirms it:
 * it must be genuine, unused (single-use), unexpired (5 min), from one of our hostnames, for our action.
 */
export function createTurnstileVerifier(opts: Options): TurnstileVerifier {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const skipBindingChecks = DUMMY_SECRET.test(opts.secret);

  return {
    async verify(token, remoteIp) {
      const body = new URLSearchParams({ secret: opts.secret, response: token, idempotency_key: randomUUID() });
      if (remoteIp) body.set('remoteip', remoteIp);

      let data: SiteverifyResponse;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(SITEVERIFY_URL, { method: 'POST', body, signal: controller.signal });
        if (!res.ok) return unavailable([`http_${res.status}`]);
        data = (await res.json()) as SiteverifyResponse;
      } catch {
        return unavailable(['network_error']);
      } finally {
        clearTimeout(timer);
      }

      const codes = data['error-codes'] ?? [];
      if (!data.success) return codes.includes('internal-error') ? unavailable(codes) : rejected(codes);

      if (!skipBindingChecks) {
        if (!data.hostname || !opts.allowedHostnames.includes(data.hostname)) return rejected(['hostname_mismatch']);
        if (data.action !== opts.action) return rejected(['action_mismatch']);
      }
      return { ok: true };
    },
  };
}

/** Local development only (no TURNSTILE_SECRET_KEY): accepts any non-empty token. */
export function createBypassVerifier(): TurnstileVerifier {
  return {
    async verify(token) {
      return token ? { ok: true } : rejected(['missing-input-response']);
    },
  };
}

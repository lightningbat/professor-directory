import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBypassVerifier, createTurnstileVerifier } from '../src/turnstile/verify.js';

const opts = { secret: 'real-secret', allowedHostnames: ['mydomain.com', 'admin.mydomain.com'], action: 'access' };

function fakeFetch(reply: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    return reply();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('Turnstile server-side verification', () => {
  it('accepts a genuine token for our hostname and action, and sends what Cloudflare needs', async () => {
    const f = fakeFetch(() => json({ success: true, hostname: 'admin.mydomain.com', action: 'access' }));
    const result = await createTurnstileVerifier({ ...opts, fetchImpl: f.fetchImpl }).verify('tok', '203.0.113.9');

    assert.deepEqual(result, { ok: true });
    assert.equal(f.calls[0]!.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(f.calls[0]!.body.get('secret'), 'real-secret');
    assert.equal(f.calls[0]!.body.get('response'), 'tok');
    assert.equal(f.calls[0]!.body.get('remoteip'), '203.0.113.9');
    assert.ok(f.calls[0]!.body.get('idempotency_key'));
  });

  it('rejects tokens Cloudflare refuses (bots, expired, already used)', async () => {
    const f = fakeFetch(() => json({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    const result = await createTurnstileVerifier({ ...opts, fetchImpl: f.fetchImpl }).verify('tok');
    assert.deepEqual(result, { ok: false, reason: 'rejected', codes: ['timeout-or-duplicate'] });
  });

  it('rejects a token that was solved on someone else’s site or for another action', async () => {
    const verifier = (reply: object) => createTurnstileVerifier({ ...opts, fetchImpl: fakeFetch(() => json(reply)).fetchImpl });
    assert.deepEqual(
      await verifier({ success: true, hostname: 'evil.example', action: 'access' }).verify('t'),
      { ok: false, reason: 'rejected', codes: ['hostname_mismatch'] },
    );
    assert.deepEqual(
      await verifier({ success: true, hostname: 'mydomain.com', action: 'login' }).verify('t'),
      { ok: false, reason: 'rejected', codes: ['action_mismatch'] },
    );
    assert.deepEqual(
      await verifier({ success: true, hostname: 'mydomain.com' }).verify('t'),
      { ok: false, reason: 'rejected', codes: ['action_mismatch'] },
    );
  });

  it('treats Cloudflare being down as "unavailable", not as a bot', async () => {
    const status500 = createTurnstileVerifier({ ...opts, fetchImpl: fakeFetch(() => json({}, 500)).fetchImpl });
    assert.equal((await status500.verify('t')).ok, false);
    assert.equal((await status500.verify('t') as { reason: string }).reason, 'unavailable');

    const throws = createTurnstileVerifier({ ...opts, fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    assert.equal((await throws.verify('t') as { reason: string }).reason, 'unavailable');

    const internal = createTurnstileVerifier({ ...opts, fetchImpl: fakeFetch(() => json({ success: false, 'error-codes': ['internal-error'] })).fetchImpl });
    assert.equal((await internal.verify('t') as { reason: string }).reason, 'unavailable');
  });

  it('gives up after the timeout instead of hanging the request', async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    const result = await createTurnstileVerifier({ ...opts, timeoutMs: 30, fetchImpl: hang }).verify('t');
    assert.equal((result as { reason: string }).reason, 'unavailable');
  });

  it('skips hostname/action checks only for Cloudflare’s dummy test secrets', async () => {
    const f = fakeFetch(() => json({ success: true, hostname: 'example.com' }));
    const dummy = createTurnstileVerifier({ ...opts, secret: '1x0000000000000000000000000000000AA', fetchImpl: f.fetchImpl });
    assert.deepEqual(await dummy.verify('t'), { ok: true });
  });

  it('bypass verifier (local dev without a secret) accepts any non-empty token', async () => {
    const v = createBypassVerifier();
    assert.deepEqual(await v.verify('anything'), { ok: true });
    assert.equal((await v.verify('')).ok, false);
  });
});

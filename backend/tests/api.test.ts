import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { boot, call } from './helpers.js';

let app: ReturnType<typeof boot>;
before(() => { app = boot(); });
after(() => app.close());

describe('GET /api/professors (logged out)', () => {
  it('paginates and reports the total', async () => {
    const { status, body } = await call(app.base, '/api/professors?page=2&pageSize=10');
    assert.equal(status, 200);
    assert.equal(body.data.length, 10);
    assert.equal(body.total, 80);
    assert.equal(body.page, 2);
  });

  it('hides emails and swaps the profile link for a Google search', async () => {
    const { body } = await call(app.base, '/api/professors?pageSize=5');
    for (const p of body.data) {
      assert.ok(!('emails' in p), 'emails must not be in the list response');
      assert.ok(p.emailCount >= 1);
      assert.match(p.profileUrl, /^https:\/\/www\.google\.com\/search\?q=/);
    }
  });

  it('applies the three filters together', async () => {
    const { body } = await call(app.base, '/api/professors?pageSize=50&college=IIT%20Delhi&designation=Professor');
    assert.ok(body.data.every((p: any) => p.college === 'IIT Delhi' && p.designation === 'Professor'));
  });

  it('searches across fields, all words must match, wildcards are literal', async () => {
    const { body } = await call(app.base, '/api/professors?pageSize=50&q=quantum%20COMPUTING');
    assert.ok(body.total > 0);
    assert.equal((await call(app.base, '/api/professors?q=%25')).body.total, 0);
  });

  it('rejects bad paging with 400', async () => {
    const { status, body } = await call(app.base, '/api/professors?pageSize=9999');
    assert.equal(status, 400);
    assert.equal(body.error.code, 'invalid_request');
  });

  it('is not cacheable across users', async () => {
    const { res } = await call(app.base, '/api/professors');
    assert.match(res.headers.get('cache-control') ?? '', /no-store/);
    assert.match(res.headers.get('vary') ?? '', /Cookie/i);
  });
});

describe('public endpoints', () => {
  it('GET /api/filters', async () => {
    const { body } = await call(app.base, '/api/filters');
    assert.ok(body.colleges.includes('IIT Bombay'));
    assert.deepEqual(body.designations, ['Assistant Professor', 'Associate Professor', 'Professor']);
  });

  it('GET /api/stats', async () => {
    const { body } = await call(app.base, '/api/stats');
    assert.equal(body.professors, 80);
  });

  it('GET /health and unknown routes', async () => {
    assert.equal((await call(app.base, '/health')).status, 200);
    assert.equal((await call(app.base, '/nope')).status, 404);
  });
});

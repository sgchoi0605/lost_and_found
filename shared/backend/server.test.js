import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { app } from './server.js';

let server;
let base;
before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

test('root redirects to the discovery page', async () => {
  const response = await fetch(base, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/discovery/index.html');
});

test('all pages, local assets, navigation and module imports resolve on short and legacy URLs', async () => {
  for (const feature of ['account', 'reports', 'discovery', 'operations']) {
    const files = await readdir(new URL(`../../features/${feature}/frontend/`, import.meta.url));
    for (const file of files.filter(name => name.endsWith('.html'))) {
      for (const prefix of [`/${feature}`, `/features/${feature}/frontend`]) {
        const url = new URL(`${prefix}/${file}`, base);
        const response = await fetch(url);
        assert.equal(response.status, 200, url.href);
        assert.match(response.headers.get('content-type'), /text\/html/);
        const html = await response.text();
        for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const asset = new URL(reference, url);
          if (asset.origin !== base) continue;
          const result = await fetch(asset);
          assert.equal(result.status, 200, asset.href);
          if (asset.pathname.endsWith('.js')) {
            assert.match(result.headers.get('content-type'), /javascript/);
            for (const [, dependency] of (await result.text()).matchAll(/import\s+["']([^"']+)["']/g)) {
              const imported = new URL(dependency, asset);
              assert.equal((await fetch(imported)).status, 200, imported.href);
            }
          }
        }
      }
    }
  }
  assert.equal((await fetch(`${base}/shared/css/base.css`)).status, 200);
});

test('four API routers expose connection checks only', async () => {
  for (const feature of ['account', 'reports', 'discovery', 'operations']) {
    const response = await fetch(`${base}/api/${feature}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { feature, status: 'ok', stage: 'routing-only' });
  }
  assert.equal((await fetch(`${base}/api/account/login`, { method: 'POST' })).status, 404);
});

test('private files and traversal requests are not served', async () => {
  for (const path of [
    '/.env', '/.env.example', '/.git/config', '/package.json', '/pnpm-lock.yaml',
    '/shared/backend/server.js', '/shared/contracts/database-schema.md',
    '/database/lostfound.db', '/features/account/backend/index.js',
    '/features/reports/reports.schema.sql', '/account/backend/index.js',
    '/account/%2e%2e%2fbackend%2findex.js',
    '/shared/%2e%2e%2fbackend%2fserver.js', '/missing.html', '/api/missing',
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.equal((await response.json()).error.code, 'NOT_FOUND');
  }
});

test('malformed JSON returns a safe error without a stack trace', async () => {
  const response = await fetch(`${base}/api/account/health`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'BAD_REQUEST', message: '요청 형식을 확인해주세요.' },
  });
});

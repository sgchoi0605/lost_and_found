// Node 기본 테스트 도구로 실제 HTTP 요청을 보내 서버 동작을 확인합니다.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { app } from './server.js';

// 빈 포트를 자동 배정받아 테스트용 서버를 열고, 검증이 끝나면 닫습니다.
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

// 첫 접속 시 메인 화면으로 이동하는지 확인합니다.
test('root redirects to the discovery page', async () => {
  const response = await fetch(base, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/discovery/index.html');
});

// 모든 화면을 두 URL 형식으로 열고 CSS·이미지·화면 링크·JS 연결을 점검합니다.
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
          // HTML이 불러오는 JS뿐 아니라 그 JS가 import하는 공통 모듈도 확인합니다.
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

// 네 기능의 라우터 연결을 확인하고, 미구현 로그인이 성공으로 응답하지 않는지 검사합니다.
test('four API routers expose connection checks only', async () => {
  for (const feature of ['account', 'reports', 'discovery', 'operations']) {
    const response = await fetch(`${base}/api/${feature}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { feature, status: 'ok', stage: 'routing-only' });
  }
  assert.equal((await fetch(`${base}/api/account/login`, { method: 'POST' })).status, 404);
});

// 비공개 파일이나 상위 폴더로 벗어나려는 요청에 파일 내용이 노출되지 않는지 확인합니다.
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

// 잘못된 JSON을 보내면 내부 실행 정보 대신 정해진 오류 응답을 받는지 검사합니다.
test('malformed JSON returns a safe error without a stack trace', async () => {
  const response = await fetch(`${base}/api/account/health`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'BAD_REQUEST', message: '요청 형식을 확인해주세요.' },
  });
});

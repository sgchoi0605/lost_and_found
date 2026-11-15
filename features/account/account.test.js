// [A] 메모리·임시 DB로 계정 API를 검사합니다. 실제 회원 DB에는 테스트 데이터를 넣지 않습니다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../shared/backend/database.js';
import { initializeDatabase } from '../../shared/backend/init-db.js';
import { createApp } from '../../shared/backend/server.js';
import { createNotification } from './backend/notification.service.js';
import { promoteAdmin } from './backend/admin.cli.js';
import { requireAuth, requireCanReport } from '../../shared/backend/auth.middleware.js';
import { hashToken } from './backend/auth.service.js';

// 테스트 전용 가입 정보를 공통으로 사용합니다.
const password = 'test-password-123';
const account = (id = 'tester') => ({
  loginId: id,
  email: `${id}@example.invalid`,
  name: '테스트 사용자',
  password,
  confirmPassword: password,
});

// 각 테스트에 별도 DB와 빈 포트의 HTTP 서버를 준비하고 종료 시 정리합니다.
async function fixture(t, database) {
  const db = database || openDatabase(':memory:');
  initializeDatabase(db);
  const app = createApp({ db });
  let server;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (!database) {
      db.close();
    }
  });
  // 브라우저 대신 HTTP 요청을 보내 상태 코드·JSON·쿠키를 검사할 수 있게 합니다.
  async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const result = await fetch(base + '/api/account' + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: result.status,
      json: await result.json(),
      cookie: result.headers.get('set-cookie')?.split(';')[0],
      headers: result.headers,
    };
  }
  async function register(id = 'tester') {
    return request('/signup', { method: 'POST', body: account(id) });
  }
  async function login(id = 'tester', cookie) {
    return request('/login', { method: 'POST', body: { loginId: id, password }, cookie });
  }
  return { db, request, register, login };
}

// 가입 입력 오류·중복 계정·관리자 권한 주입 방지를 확인합니다.
test('signup validates inputs, rejects duplicates and never grants requested admin role', async (t) => {
  const f = await fixture(t);
  for (const bad of [
    { loginId: '!' },
    { email: 'bad' },
    { name: ' ' },
    { password: 'short' },
    { confirmPassword: 'different' },
  ]) {
    assert.equal(
      (await f.request('/signup', { method: 'POST', body: { ...account(), ...bad } })).status,
      400,
    );
  }
  const created = await f.request('/signup', {
    method: 'POST',
    body: { ...account(), role: 'ADMIN', report_blocked: true },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.role, 'USER');
  assert.equal(created.json.data.report_blocked, false);
  assert.equal('password_hash' in created.json.data, false);
  const row = f.db.prepare('SELECT * FROM users').get();
  assert.match(row.password_hash, /^scrypt:/);
  assert.equal(row.password_hash.includes(password), false);
  assert.equal((await f.register()).status, 409);
  assert.equal(
    (
      await f.request('/signup', {
        method: 'POST',
        body: { ...account('other'), email: 'TESTER@example.invalid' },
      })
    ).status,
    409,
  );
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM audit_logs').get().n, 1);
});

// 로그인 쿠키 발급·세션 교체·로그아웃 후 접근 차단을 확인합니다.
test('login uses HttpOnly cookies, rejects wrong credentials, rotates sessions, logout revokes', async (t) => {
  const f = await fixture(t);
  await f.register();
  for (const body of [
    { loginId: 'tester', password: 'wrong' },
    { loginId: 'missing', password },
  ]) {
    assert.equal((await f.request('/login', { method: 'POST', body })).status, 401);
  }
  assert.equal((await f.request('/me')).status, 401);
  const login = await f.login();
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
  const stored = f.db.prepare('SELECT token_hash FROM sessions').get().token_hash;
  assert.equal(stored, hashToken(login.cookie.split('=')[1]));
  assert.notEqual(stored, login.cookie.split('=')[1]);
  assert.equal((await f.request('/me', { cookie: login.cookie })).json.data.login_id, 'tester');
  const rotated = await f.login('tester', login.cookie);
  assert.notEqual(rotated.cookie, login.cookie);
  assert.equal((await f.request('/me', { cookie: login.cookie })).status, 401);
  assert.equal(
    (await f.request('/logout', { method: 'POST', body: {}, cookie: rotated.cookie })).status,
    200,
  );
  assert.equal((await f.request('/me', { cookie: rotated.cookie })).status, 401);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM audit_logs WHERE action = 'LOGOUT'").get().n,
    1,
  );
});

// 만료되거나 형식이 잘못된 세션으로 로그인할 수 없는지 확인합니다.
test('expired and malformed session cookies cannot authenticate', async (t) => {
  const f = await fixture(t);
  await f.register();
  const login = await f.login();
  f.db.prepare('UPDATE sessions SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
  assert.equal((await f.request('/me', { cookie: login.cookie })).status, 401);
  assert.equal((await f.request('/me', { cookie: 'lf_session=malformed' })).status, 401);
});

// DB 연결과 서버가 바뀌어도 저장한 세션·알림이 유지되는지 확인합니다.
test('sessions and notifications survive application and database reconnection', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lf-account-'));
  const filename = join(directory, 'test.db');
  let db = openDatabase(filename);
  const f = await fixture(t, db);
  await f.register();
  const login = await f.login();
  const userId = login.json.data.user_id;
  createNotification(db, { userId, type: 'MATCH', message: '실제 저장 알림' });
  // 첫 앱은 더 요청하지 않습니다. 동일 파일을 새 연결·앱에서 읽습니다.
  db.close();
  db = openDatabase(filename);
  const g = await fixture(t, db);
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  assert.equal((await g.request('/me', { cookie: login.cookie })).status, 200);
  assert.equal((await g.request('/notifications', { cookie: login.cookie })).json.data.total, 1);
});

// 타인의 알림 접근 차단·읽음 반복 처리·내 알림만 전체 읽음을 확인합니다.
test('notification access is owner scoped, read is idempotent, read-all does not affect others', async (t) => {
  const f = await fixture(t);
  await f.register();
  await f.register('other');
  const a = await f.login();
  const b = await f.login('other');
  const aid = a.json.data.user_id,
    bid = b.json.data.user_id;
  const id = createNotification(f.db, {
    userId: aid,
    type: 'MATCH',
    message: '<script>alert(1)</script>',
    targetPath: '/discovery/matches.html',
  });
  createNotification(f.db, { userId: aid, type: 'HANDOVER', message: '인계 승인' });
  createNotification(f.db, { userId: bid, type: 'EXPIRY', message: '보관 기한' });
  const list = await f.request('/notifications?limit=1', { cookie: a.cookie });
  assert.equal(list.json.data.total, 2);
  assert.equal(list.json.data.items.length, 1);
  assert.equal(list.json.data.unreadCount, 2);
  assert.equal(
    (await f.request(`/notifications/${id}/read`, { method: 'PATCH', body: {}, cookie: b.cookie }))
      .status,
    404,
  );
  const first = await f.request(`/notifications/${id}/read`, {
    method: 'PATCH',
    body: {},
    cookie: a.cookie,
  });
  const second = await f.request(`/notifications/${id}/read`, {
    method: 'PATCH',
    body: {},
    cookie: a.cookie,
  });
  assert.equal(first.json.data.read_at, second.json.data.read_at);
  assert.equal(
    (await f.request('/notifications/read-all', { method: 'PATCH', body: {}, cookie: a.cookie }))
      .json.data.updated,
    1,
  );
  assert.equal((await f.request('/notifications', { cookie: b.cookie })).json.data.unreadCount, 1);
  assert.equal((await f.request('/notifications?limit=101', { cookie: a.cookie })).status, 400);
  for (const path of [
    'https://evil.invalid/',
    '//evil.invalid/',
    '/\\evil.invalid',
    '/discovery/matches.html?x=<script>',
  ]) {
    assert.throws(() =>
      createNotification(f.db, { userId: aid, type: 'MATCH', message: 'test', targetPath: path }),
    );
  }
  assert.throws(() => createNotification(f.db, { userId: 999, type: 'MATCH', message: 'test' }));
});

// 관리자만 제한을 변경하고, 제한 만료와 사유 기록이 동작하는지 확인합니다.
test('admin lists users, restricts with audit, cannot restrict admins, and restriction expires', async (t) => {
  const f = await fixture(t);
  await f.register();
  await f.register('admin');
  promoteAdmin(f.db, 'admin');
  const user = await f.login();
  const admin = await f.login('admin');
  const id = user.json.data.user_id;
  assert.equal((await f.request('/admin/users')).status, 401);
  assert.equal((await f.request('/admin/users', { cookie: user.cookie })).status, 403);
  const list = await f.request('/admin/users?q=tester', { cookie: admin.cookie });
  assert.equal(list.json.data.total, 1);
  assert.equal('password_hash' in list.json.data.items[0], false);
  const change = (target, body, cookie = admin.cookie) =>
    f.request(`/admin/users/${target}/restriction`, { method: 'PATCH', body, cookie });
  assert.equal((await change(id, { blocked: true, reason: '' })).status, 400);
  assert.equal(
    (await change(id, { blocked: true, reason: '반복 허위 신고', until: '2000-01-01' })).status,
    400,
  );
  assert.equal(
    (await change(id, { blocked: true, reason: '반복 허위 신고' }, user.cookie)).status,
    403,
  );
  assert.equal(
    (await change(admin.json.data.user_id, { blocked: true, reason: 'test' })).status,
    403,
  );
  assert.equal(
    (await change(id, { blocked: true, reason: '반복 허위 신고' })).json.data.report_blocked,
    true,
  );
  assert.equal((await f.request('/me', { cookie: user.cookie })).json.data.report_blocked, true);
  const fakeReq = { headers: { cookie: user.cookie }, db: f.db };
  requireAuth(fakeReq, {}, () => {});
  assert.throws(() => requireCanReport(fakeReq, {}, () => {}), /신고 등록/);
  f.db
    .prepare('UPDATE users SET blocked_until = ? WHERE user_id = ?')
    .run('2000-01-01T00:00:00.000Z', id);
  requireAuth(fakeReq, {}, () => {});
  let passed = false;
  requireCanReport(fakeReq, {}, () => {
    passed = true;
  });
  assert.equal(passed, true);
  assert.equal(
    (await change(id, { blocked: false, reason: '소명 완료' })).json.data.report_blocked,
    false,
  );
  const audit = f.db.prepare("SELECT * FROM audit_logs WHERE action = 'REPORT_BLOCK'").get();
  assert.equal(audit.actor_id, admin.json.data.user_id);
  assert.match(audit.detail_json, /반복 허위 신고/);
});

// 외부 사이트 요청과 JSON 형식이 아닌 변경 요청을 거부하는지 확인합니다.
test('mutations reject cross-origin requests, non-JSON content and arrays', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request('/signup', {
        method: 'POST',
        body: account(),
        headers: { Origin: 'https://evil.invalid' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/signup', {
        method: 'POST',
        body: account(),
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      })
    ).status,
    403,
  );
  assert.equal((await f.request('/signup', { method: 'POST' })).status, 415);
  assert.equal((await f.request('/signup', { method: 'POST', body: [] })).status, 400);
});

// 같은 IP에서 짧은 시간에 인증을 반복하면 제한되는지 확인합니다.
test('login attempts are bounded', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 30; i++) {
    assert.equal((await f.request('/login', { method: 'POST', body: {} })).status, 400);
  }
  const response = await f.request('/login', { method: 'POST', body: {} });
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
});

// 기존 회원을 보존하면서 세션 테이블을 추가하는지 확인합니다.
test('v1 database upgrade preserves users and adds persistent sessions', (t) => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  // 스키마 v1은 현재 account SQL에서 세션 테이블만 빠진 형태입니다.
  initializeDatabase(db);
  db.exec('DROP TABLE sessions; PRAGMA user_version = 1;');
  db.prepare('INSERT INTO users (login_id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
    'legacy',
    'legacy@example.invalid',
    '기존 회원',
    'hash',
  );
  initializeDatabase(db);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
});

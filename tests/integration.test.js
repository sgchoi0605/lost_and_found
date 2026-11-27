// [ABC] 개별 기능 검사에서 놓쳤던 실제 HTTP 연동과 상태 충돌 회귀 검사입니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../shared/backend/database.js';
import { initializeDatabase, schemaFiles } from '../shared/backend/init-db.js';
import { createApp } from '../shared/backend/server.js';
import { promoteAdmin } from '../features/account/backend/admin.cli.js';

async function fixture(t) {
  const db = openDatabase(':memory:');
  initializeDatabase(db);
  const server = createApp({ db }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(base + path, { method, headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function user(loginId, admin = false) {
    const password = 'integration-password';
    const result = await request('/api/account/signup', 'POST', {
      loginId, password, confirmPassword: password, email: `${loginId}@example.invalid`, name: loginId,
    });
    assert.equal(result.status, 201);
    if (admin) promoteAdmin(db, loginId);
    const login = await request('/api/account/login', 'POST', { loginId, password });
    assert.equal(login.status, 200);
    return { ...result.body.data, cookie: login.cookie };
  }
  const owner = await user('owner');
  const admin = await user('admin', true);
  const fields = { itemName: '검정 지갑', category: '지갑', place: '도서관', occurredAt: '2026-11-20T09:30:00+09:00', description: '은색 지퍼' };
  async function create(reportType = 'LOST', overrides = {}) {
    const result = await request('/api/reports', 'POST', { ...fields, reportType, ...overrides }, owner.cookie);
    assert.equal(result.status, 201);
    return result.body.data;
  }
  async function pair() {
    const lost = await create(); const found = await create('FOUND', { storagePlace: '학생회관' });
    const result = await request(`/api/discovery/reports/${lost.report_id}/matches`, 'POST', {}, owner.cookie);
    assert.equal(result.status, 200); assert.equal(result.body.data.created, 1);
    const match = db.prepare('SELECT * FROM matches WHERE lost_report_id = ?').get(lost.report_id);
    return { lost, found, match };
  }
  async function review(id, action) {
    return request(`/api/discovery/admin/matches/${id}/review`, 'POST', { action }, admin.cookie);
  }
  return { db, request, owner, admin, fields, create, pair, review };
}

test('HTTP: signup, reports, injected-memory DB search/detail/matches, notifications and stats work together', async (t) => {
  const f = await fixture(t); const { lost, found, match } = await f.pair();
  const search = await f.request('/api/discovery/reports?q=' + encodeURIComponent('지갑'));
  assert.equal(search.body.data.total, 2);
  const detail = await f.request(`/api/discovery/reports/${found.report_id}`);
  assert.equal(detail.body.data.storage_place, '학생회관');
  assert.equal(detail.body.data.description, '은색 지퍼');
  assert.equal(lost.occurred_at, '2026-11-20T00:30:00.000Z');
  assert.equal((await f.review(match.match_id, 'CONFIRM')).status, 200);
  const notifications = await f.request('/api/account/notifications', 'GET', undefined, f.owner.cookie);
  assert.equal(notifications.body.data.total, 2);
  const stats = await f.request('/api/discovery/admin/stats', 'GET', undefined, f.admin.cookie);
  assert.equal(stats.status, 200);
  assert.equal((await f.review(match.match_id, 'RELEASE')).status, 200);
  assert.equal(f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(lost.report_id).status, 'REPORTED');
});

test('confirmed matches block B status changes, owner edits/deletes and administrator deletes', async (t) => {
  const f = await fixture(t); const { lost, found, match } = await f.pair();
  assert.equal((await f.review(match.match_id, 'CONFIRM')).status, 200);
  for (const [path, method, body, cookie] of [
    [`/api/reports/admin/${lost.report_id}/status`, 'PATCH', { status: 'REPORTED' }, f.admin.cookie],
    [`/api/reports/${lost.report_id}`, 'PATCH', f.fields, f.owner.cookie],
    [`/api/reports/${found.report_id}`, 'DELETE', {}, f.owner.cookie],
    [`/api/reports/admin/${found.report_id}`, 'DELETE', {}, f.admin.cookie],
  ]) {
    const result = await f.request(path, method, body, cookie);
    assert.equal(result.status, 409); assert.equal(result.body.error.code, 'REPORT_LOCKED');
  }
  assert.equal(f.db.prepare('SELECT status FROM matches').get().status, 'CONFIRMED');
  assert.equal((await f.review(match.match_id, 'RELEASE')).status, 200);
  assert.equal((await f.request(`/api/reports/${lost.report_id}`, 'DELETE', {}, f.owner.cookie)).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
});

test('editing/deleting a report invalidates candidates atomically; stale candidates cannot be confirmed', async (t) => {
  const f = await fixture(t); const { lost, found, match } = await f.pair();
  const edited = await f.request(`/api/reports/${lost.report_id}`, 'PATCH', { ...f.fields, category: '가방' }, f.owner.cookie);
  assert.equal(edited.status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  assert.equal((await f.review(match.match_id, 'CONFIRM')).status, 404);
  const generated = await f.request(`/api/discovery/reports/${lost.report_id}/matches`, 'POST', {}, f.owner.cookie);
  assert.equal(generated.body.data.created, 0);
  // 외부의 오래된 후보가 남아 있더라도 확정 시 재검사해야 합니다.
  f.db.prepare("INSERT INTO matches(lost_report_id, found_report_id, similarity) VALUES (?, ?, 1)").run(lost.report_id, found.report_id);
  const stale = f.db.prepare('SELECT match_id FROM matches').get();
  const rejected = await f.review(stale.match_id, 'CONFIRM');
  assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, 'STALE_MATCH');
  assert.equal((await f.request(`/api/reports/${found.report_id}`, 'DELETE', {}, f.owner.cookie)).status, 200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'MATCH_INVALIDATE'").get().n, 2);
});

test('failed report update rolls candidate invalidation back in the same transaction', async (t) => {
  const f = await fixture(t); const { lost } = await f.pair();
  f.db.exec("CREATE TRIGGER fail_edit BEFORE UPDATE OF item_name ON reports BEGIN SELECT RAISE(ABORT, 'forced failure'); END;");
  const result = await f.request(`/api/reports/${lost.report_id}`, 'PATCH', f.fields, f.owner.cookie);
  assert.equal(result.status, 500);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM matches').get().n, 1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'MATCH_INVALIDATE'").get().n, 0);
});

test('B only accepts REPORTED -> RECEIVED -> STORED for found items, and never allows workflow bypass', async (t) => {
  const f = await fixture(t); const found = await f.create('FOUND'); const lost = await f.create();
  const change = (id, status) => f.request(`/api/reports/admin/${id}/status`, 'PATCH', { status }, f.admin.cookie);
  assert.equal((await change(found.report_id, 'STORED')).status, 409);
  assert.equal((await change(found.report_id, 'RECEIVED')).status, 200);
  assert.equal((await change(found.report_id, 'STORED')).status, 200);
  for (const status of ['REPORTED', 'MATCHED', 'HANDED_OVER', 'DISPOSED', 'TRANSFERRED']) assert.equal((await change(found.report_id, status)).status, 409);
  assert.equal((await change(lost.report_id, 'RECEIVED')).status, 200);
  assert.equal((await change(lost.report_id, 'STORED')).status, 409);
});

test('pending handover or a storage record protects report edits, deletes and status changes', async (t) => {
  const f = await fixture(t); const found = await f.create('FOUND');
  f.db.prepare('INSERT INTO handover_requests(found_report_id, requester_id, ownership_proof) VALUES (?, ?, ?)').run(found.report_id, f.owner.user_id, '검정 지갑');
  assert.equal((await f.request(`/api/reports/${found.report_id}`, 'DELETE', {}, f.owner.cookie)).status, 409);
  f.db.exec("UPDATE handover_requests SET status = 'REJECTED'");
  f.db.prepare("INSERT INTO storage_records(found_report_id, storage_place, stored_at, storage_deadline) VALUES (?, '학생회관', '2026-11-20', '2027-01-20')").run(found.report_id);
  assert.equal((await f.request(`/api/reports/${found.report_id}`, 'PATCH', f.fields, f.owner.cookie)).status, 409);
  assert.equal((await f.request(`/api/reports/admin/${found.report_id}/status`, 'PATCH', { status: 'RECEIVED' }, f.admin.cookie)).status, 409);
});

test('administrator search and pagination expose reports beyond the first fifty', async (t) => {
  const f = await fixture(t);
  const insert = f.db.prepare("INSERT INTO reports(author_id, report_type, item_name, category, place, occurred_at) VALUES (?, 'FOUND', ?, '기타', '도서관', '2026-11-20T00:00:00Z')");
  for (let i = 0; i < 55; i++) insert.run(f.owner.user_id, `물품 ${i}`);
  const page = await f.request('/api/reports/mine?page=3&limit=20', 'GET', undefined, f.owner.cookie);
  assert.equal(page.body.data.total, 55); assert.equal(page.body.data.items.length, 15);
  const result = await f.request('/api/reports/admin?q=' + encodeURIComponent('물품 54'), 'GET', undefined, f.admin.cookie);
  assert.equal(result.body.data.total, 1);
  const wildcard = await f.request('/api/reports/admin?q=%25', 'GET', undefined, f.admin.cookie);
  assert.equal(wildcard.body.data.total, 0);
});

test('v2 migration preserves records, separates legacy storage place and is repeatable', () => {
  const db = openDatabase(':memory:');
  try {
    for (const file of schemaFiles) db.exec(readFileSync(file, 'utf8').replace(/  storage_place TEXT NOT NULL DEFAULT '',\r?\n/, ''));
    db.exec("PRAGMA user_version = 2");
    db.prepare('INSERT INTO users(login_id, email, name, password_hash) VALUES (?, ?, ?, ?)').run('legacy', 'legacy@example.invalid', 'Legacy', 'hash');
    db.prepare("INSERT INTO reports(author_id, report_type, item_name, category, place, occurred_at, description) VALUES (1, 'FOUND', '지갑', '지갑', '도서관', '2026-11-20', ?)").run('[보관 장소: 학생회관]\n은색 지퍼');
    initializeDatabase(db); initializeDatabase(db);
    const row = db.prepare('SELECT * FROM reports').get();
    assert.equal(row.storage_place, '학생회관'); assert.equal(row.description, '은색 지퍼');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  } finally { db.close(); }
});

test('ABCD E2E: signup -> reports -> search/match -> handover complete & storage dispose -> notifications & stats', async (t) => {
  const f = await fixture(t);
  const { lost, found, match } = await f.pair();

  // 두 번째 습득물(폐기 대상) 등록
  const expiredFound = await f.create('FOUND', {
    itemName: '초록 우산',
    category: '우산',
    place: '학생회관',
    storagePlace: '관리실',
  });

  // C: 검색 및 매칭 확정
  const search = await f.request('/api/discovery/reports?q=' + encodeURIComponent('지갑'));
  assert.equal(search.status, 200);
  assert.equal(search.body.data.total, 2);
  assert.equal((await f.review(match.match_id, 'CONFIRM')).status, 200);

  // D: 두 습득물 보관 접수 (매칭된 물품은 MATCHED 유지, 미매칭 물품은 STORED)
  const stMatched = await f.request(
    '/api/operations/admin/storage',
    'POST',
    { foundReportId: found.report_id },
    f.admin.cookie,
  );
  assert.equal(stMatched.status, 201);
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(found.report_id).status,
    'MATCHED',
  );

  const stExpired = await f.request(
    '/api/operations/admin/storage',
    'POST',
    {
      foundReportId: expiredFound.report_id,
      storedAt: '2026-01-01T00:00:00.000Z',
      storageDeadline: '2026-06-01T00:00:00.000Z',
    },
    f.admin.cookie,
  );
  assert.equal(stExpired.status, 201);

  // D: 인계 신청 -> 진행 중에는 C 매칭 해제 차단 (409 HANDOVER_CONFLICT)
  const handover = await f.request(
    '/api/operations/handovers',
    'POST',
    {
      foundReportId: found.report_id,
      lostReportId: lost.report_id,
      contact: '010-9999-8888',
      ownershipProof: '지갑 안쪽 이니셜 각인',
    },
    f.owner.cookie,
  );
  assert.equal(handover.status, 201);
  const blockedRelease = await f.review(match.match_id, 'RELEASE');
  assert.equal(blockedRelease.status, 409);
  assert.equal(blockedRelease.body.error.code, 'HANDOVER_CONFLICT');

  // D: 관리자 검토 -> 승인 -> 실물 인계 완료
  const requestId = handover.body.data.request_id;
  assert.equal(
    (
      await f.request(
        `/api/operations/admin/handovers/${requestId}/status`,
        'PATCH',
        { status: 'UNDER_REVIEW' },
        f.admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(
        `/api/operations/admin/handovers/${requestId}/status`,
        'PATCH',
        { status: 'APPROVED', reviewNote: '본인 확인' },
        f.admin.cookie,
      )
    ).status,
    200,
  );
  const completed = await f.request(
    `/api/operations/admin/handovers/${requestId}/complete`,
    'POST',
    { recipientName: '소유자' },
    f.admin.cookie,
  );
  assert.equal(completed.status, 200);
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(found.report_id).status,
    'HANDED_OVER',
  );
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(lost.report_id).status,
    'HANDED_OVER',
  );
  assert.equal(
    f.db
      .prepare('SELECT status FROM storage_records WHERE storage_id = ?')
      .get(stMatched.body.data.storage_id).status,
    'HANDED_OVER',
  );

  // D: 만료 물품 기한 점검(EXPIRY 알림) 및 폐기 처리
  const retention = await f.request(
    '/api/operations/admin/storage/check-retention',
    'POST',
    { withinDays: 7 },
    f.admin.cookie,
  );
  assert.equal(retention.status, 200);
  assert.equal(retention.body.data.expiredCount, 1);
  assert.equal(retention.body.data.notifiedCount, 1);

  const disposed = await f.request(
    `/api/operations/admin/storage/${stExpired.body.data.storage_id}/dispose`,
    'POST',
    { status: 'DISPOSED', dispositionNote: '보관 기한 만료 폐기' },
    f.admin.cookie,
  );
  assert.equal(disposed.status, 200);
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(expiredFound.report_id)
      .status,
    'DISPOSED',
  );

  // A: 알림(MATCH, HANDOVER, EXPIRY) 수신 확인
  const ownerNotifs = await f.request('/api/account/notifications', 'GET', undefined, f.owner.cookie);
  const ownerTypes = new Set(ownerNotifs.body.data.items.map((n) => n.type));
  assert.ok(ownerTypes.has('MATCH'));
  assert.ok(ownerTypes.has('HANDOVER'));

  const adminNotifs = await f.request('/api/account/notifications', 'GET', undefined, f.admin.cookie);
  assert.ok(adminNotifs.body.data.items.some((n) => n.type === 'EXPIRY'));

  // C: 관리자 통계 인계 완료율(습득물 2건 중 1건 완료 = 50%) 및 인계 집계 반영 확인
  const stats = await f.request('/api/discovery/admin/stats', 'GET', undefined, f.admin.cookie);
  assert.equal(stats.status, 200);
  assert.equal(stats.body.data.summary.foundReports, 2);
  assert.equal(stats.body.data.summary.completedFoundReports, 1);
  assert.equal(stats.body.data.summary.handoverCompletionRate, 50);
  assert.equal(stats.body.data.summary.pendingReports, 0);
  assert.equal(stats.body.data.handover.completed, 1);
});

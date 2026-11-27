// [D] 인계 신청·심사·완료, 보관 접수·기한 점검·폐기·이관 기능의 정상·오류 동작을 검증합니다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../shared/backend/database.js';
import { initializeDatabase } from '../../shared/backend/init-db.js';
import { createApp } from '../../shared/backend/server.js';
import { promoteAdmin } from '../account/backend/admin.cli.js';

async function fixture(t) {
  const db = openDatabase(':memory:');
  initializeDatabase(db);
  const server = createApp({ db }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }

  async function createUser(loginId, admin = false) {
    const password = 'operations-test-pass';
    const signup = await request('/api/account/signup', 'POST', {
      loginId,
      password,
      confirmPassword: password,
      email: `${loginId}@example.invalid`,
      name: loginId,
    });
    assert.equal(signup.status, 201);
    if (admin) {
      promoteAdmin(db, loginId);
    }
    const login = await request('/api/account/login', 'POST', { loginId, password });
    assert.equal(login.status, 200);
    return { ...signup.body.data, cookie: login.cookie };
  }

  const finder = await createUser('finder1');
  const owner = await createUser('owner1');
  const admin = await createUser('admin1', true);

  async function createReport(cookie, overrides = {}) {
    const res = await request(
      '/api/reports',
      'POST',
      {
        reportType: 'FOUND',
        itemName: '검정 가죽 지갑',
        category: '지갑',
        place: '도서관 1층',
        occurredAt: '2026-11-20T09:00:00.000Z',
        description: '은색 지퍼',
        storagePlace: '학생회관 안내실',
        ...overrides,
      },
      cookie,
    );
    assert.equal(res.status, 201);
    return res.body.data;
  }

  return { db, request, finder, owner, admin, createReport };
}

test('health reports operations-ready', async (t) => {
  const f = await fixture(t);
  const res = await f.request('/api/operations/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { feature: 'operations', status: 'ok', stage: 'operations-ready' });
});

test('handover apply validates auth, report type, duplicate prevention, contact storage, and mine list', async (t) => {
  const f = await fixture(t);
  const found = await f.createReport(f.finder.cookie, { reportType: 'FOUND' });
  const lost = await f.createReport(f.owner.cookie, { reportType: 'LOST', storagePlace: '' });

  // 비로그인 차단 (401)
  const unauth = await f.request('/api/operations/handovers', 'POST', {
    foundReportId: found.report_id,
    ownershipProof: '학생증 있음',
  });
  assert.equal(unauth.status, 401);

  // 습득물이 아닌 신고 차단 (400)
  const notFoundType = await f.request(
    '/api/operations/handovers',
    'POST',
    { foundReportId: lost.report_id, ownershipProof: '학생증 있음' },
    f.owner.cookie,
  );
  assert.equal(notFoundType.status, 400);

  // 정상 신청 (연락처 포함 저장 + 상태 동기화 + 감사 로그 + 습득자 알림)
  const created = await f.request(
    '/api/operations/handovers',
    'POST',
    {
      foundReportId: found.report_id,
      lostReportId: lost.report_id,
      contact: '010-1111-2222',
      ownershipProof: '내부에 학교 학생증이 있습니다.',
    },
    f.owner.cookie,
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'REQUESTED');
  assert.match(created.body.data.ownership_proof, /^\[연락처: 010-1111-2222\]/);

  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(found.report_id).status,
    'HANDOVER_IN_PROGRESS',
  );
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(lost.report_id).status,
    'HANDOVER_IN_PROGRESS',
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_logs WHERE target_type = 'HANDOVER' AND action = 'HANDOVER_CREATE'",
      )
      .get().n,
    1,
  );
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'HANDOVER'")
      .get(f.finder.user_id).n,
    1,
  );

  // 중복 신청 차단 (409)
  const dup = await f.request(
    '/api/operations/handovers',
    'POST',
    { foundReportId: found.report_id, ownershipProof: '재신청 시도' },
    f.owner.cookie,
  );
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'HANDOVER_ALREADY_EXISTS');

  // 본인 신청 목록 조회
  const mine = await f.request('/api/operations/handovers/mine', 'GET', undefined, f.owner.cookie);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.data.total, 1);
  assert.equal(mine.body.data.items[0].request_id, created.body.data.request_id);
});

test('admin handover review and completion enforce role, forward-only transitions, atomic sync, audit, and notifications', async (t) => {
  const f = await fixture(t);
  const found = await f.createReport(f.finder.cookie, { reportType: 'FOUND' });
  const lost = await f.createReport(f.owner.cookie, { reportType: 'LOST', storagePlace: '' });

  // 보관 접수 선행
  const stored = await f.request(
    '/api/operations/admin/storage',
    'POST',
    { foundReportId: found.report_id },
    f.admin.cookie,
  );
  assert.equal(stored.status, 201);

  const created = await f.request(
    '/api/operations/handovers',
    'POST',
    { foundReportId: found.report_id, lostReportId: lost.report_id, ownershipProof: '내부 카드' },
    f.owner.cookie,
  );
  const requestId = created.body.data.request_id;

  // 일반 사용자 관리자 API 접근 차단 (403)
  assert.equal(
    (await f.request('/api/operations/admin/handovers', 'GET', undefined, f.owner.cookie)).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        `/api/operations/admin/handovers/${requestId}/status`,
        'PATCH',
        { status: 'APPROVED' },
        f.owner.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        `/api/operations/admin/handovers/${requestId}/complete`,
        'POST',
        { recipientName: '홍길동' },
        f.owner.cookie,
      )
    ).status,
    403,
  );

  // 승인 전 완료 차단 (409)
  const earlyComplete = await f.request(
    `/api/operations/admin/handovers/${requestId}/complete`,
    'POST',
    { recipientName: '홍길동' },
    f.admin.cookie,
  );
  assert.equal(earlyComplete.status, 409);

  // REQUESTED -> UNDER_REVIEW -> APPROVED
  const underReview = await f.request(
    `/api/operations/admin/handovers/${requestId}/status`,
    'PATCH',
    { status: 'UNDER_REVIEW', reviewNote: '증빙 확인 시작' },
    f.admin.cookie,
  );
  assert.equal(underReview.status, 200);
  assert.equal(underReview.body.data.status, 'UNDER_REVIEW');

  // 상태 변경 API로 COMPLETED 직접 지정 금지 (409)
  const badStatus = await f.request(
    `/api/operations/admin/handovers/${requestId}/status`,
    'PATCH',
    { status: 'COMPLETED' },
    f.admin.cookie,
  );
  assert.equal(badStatus.status, 409);

  const approved = await f.request(
    `/api/operations/admin/handovers/${requestId}/status`,
    'PATCH',
    { status: 'APPROVED', reviewNote: '소유자 확인 완료' },
    f.admin.cookie,
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.status, 'APPROVED');
  // APPROVED만으로는 인계 완료가 아님
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(found.report_id).status,
    'HANDOVER_IN_PROGRESS',
  );

  // 실물 인계 완료 (수령인 + 완료 일시 기록 + reports·storage_records 동시 HANDED_OVER)
  const completed = await f.request(
    `/api/operations/admin/handovers/${requestId}/complete`,
    'POST',
    { recipientName: '홍길동', completedAt: '2026-11-26T05:00:00.000Z' },
    f.admin.cookie,
  );
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.status, 'COMPLETED');
  assert.equal(completed.body.data.recipient_name, '홍길동');
  assert.equal(completed.body.data.completed_at, '2026-11-26T05:00:00.000Z');

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
      .get(stored.body.data.storage_id).status,
    'HANDED_OVER',
  );

  // 완료 후 대기 상태로 되돌리기 차단 (409)
  const resetBlocked = await f.request(
    `/api/operations/admin/handovers/${requestId}/status`,
    'PATCH',
    { status: 'REQUESTED' },
    f.admin.cookie,
  );
  assert.equal(resetBlocked.status, 409);

  // 감사 로그 및 HANDOVER 알림 확인
  const auditActions = f.db
    .prepare(
      "SELECT action FROM audit_logs WHERE target_type = 'HANDOVER' AND target_id = ? ORDER BY log_id ASC",
    )
    .all(requestId)
    .map((r) => r.action);
  assert.deepEqual(auditActions, [
    'HANDOVER_CREATE',
    'HANDOVER_UNDER_REVIEW',
    'HANDOVER_APPROVED',
    'HANDOVER_COMPLETE',
  ]);
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'HANDOVER'")
      .get(f.owner.user_id).n,
    3,
  );
});

test('rejecting handover restores previous report status and permits reapplication', async (t) => {
  const f = await fixture(t);
  const found = await f.createReport(f.finder.cookie, { reportType: 'FOUND' });
  await f.request(
    '/api/operations/admin/storage',
    'POST',
    { foundReportId: found.report_id },
    f.admin.cookie,
  );

  const first = await f.request(
    '/api/operations/handovers',
    'POST',
    { foundReportId: found.report_id, ownershipProof: '잘못된 특징' },
    f.owner.cookie,
  );
  assert.equal(first.status, 201);

  const rejected = await f.request(
    `/api/operations/admin/handovers/${first.body.data.request_id}/status`,
    'PATCH',
    { status: 'REJECTED', reviewNote: '특징 불일치' },
    f.admin.cookie,
  );
  assert.equal(rejected.status, 200);
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(found.report_id).status,
    'STORED',
  );

  // 거절 후 되돌리기 차단
  assert.equal(
    (
      await f.request(
        `/api/operations/admin/handovers/${first.body.data.request_id}/status`,
        'PATCH',
        { status: 'REQUESTED' },
        f.admin.cookie,
      )
    ).status,
    409,
  );

  // 새 인계 신청 가능
  const second = await f.request(
    '/api/operations/handovers',
    'POST',
    { foundReportId: found.report_id, ownershipProof: '정확한 특징' },
    f.owner.cookie,
  );
  assert.equal(second.status, 201);
});

test('storage intake, update isolation, retention EXPIRY alerts, and disposal/transfer work with conflict guards', async (t) => {
  const f = await fixture(t);
  const foundSoon = await f.createReport(f.finder.cookie, {
    itemName: '임박 우산',
    storagePlace: '경비실',
  });
  const foundExpired = await f.createReport(f.finder.cookie, {
    itemName: '만료 키링',
    storagePlace: '관리실',
  });
  const foundBusy = await f.createReport(f.finder.cookie, {
    itemName: '인계중 이어폰',
    storagePlace: '안내데스크',
  });

  // 일반 사용자 보관 API 차단 (403)
  assert.equal(
    (await f.request('/api/operations/admin/storage', 'GET', undefined, f.owner.cookie)).status,
    403,
  );

  // 미등록 후보 조회
  const candidates = await f.request(
    '/api/operations/admin/storage/candidates',
    'GET',
    undefined,
    f.admin.cookie,
  );
  assert.equal(candidates.status, 200);
  assert.equal(candidates.body.data.total, 3);

  // 임박 물품(3일 후 만료) 등록: reports.storage_place 초기값 사용
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const stSoon = await f.request(
    '/api/operations/admin/storage',
    'POST',
    { foundReportId: foundSoon.report_id, storageDeadline: inThreeDays },
    f.admin.cookie,
  );
  assert.equal(stSoon.status, 201);
  assert.equal(stSoon.body.data.storage_place, '경비실');
  assert.equal(stSoon.body.data.retention_state, 'EXPIRING_SOON');

  // 중복 보관 등록 차단 (409)
  assert.equal(
    (
      await f.request(
        '/api/operations/admin/storage',
        'POST',
        { foundReportId: foundSoon.report_id },
        f.admin.cookie,
      )
    ).status,
    409,
  );

  // 보관 수정은 storage_records만 갱신하고 B의 reports.storage_place는 보존
  const updated = await f.request(
    `/api/operations/admin/storage/${stSoon.body.data.storage_id}`,
    'PATCH',
    { storagePlace: '중앙보관함 B-1' },
    f.admin.cookie,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.storage_place, '중앙보관함 B-1');
  assert.equal(
    f.db.prepare('SELECT storage_place FROM reports WHERE report_id = ?').get(foundSoon.report_id)
      .storage_place,
    '경비실',
  );

  // 기한 초과 물품 등록
  const stExpired = await f.request(
    '/api/operations/admin/storage',
    'POST',
    {
      foundReportId: foundExpired.report_id,
      storedAt: '2026-01-01T00:00:00.000Z',
      storageDeadline: '2026-06-01T00:00:00.000Z',
    },
    f.admin.cookie,
  );
  assert.equal(stExpired.status, 201);
  assert.equal(stExpired.body.data.retention_state, 'EXPIRED');

  // 보관 기한 점검 -> 임박 1건 + 만료 1건, EXPIRY 알림 2건 생성 및 재실행 시 중복 방지
  const check1 = await f.request(
    '/api/operations/admin/storage/check-retention',
    'POST',
    { withinDays: 7 },
    f.admin.cookie,
  );
  assert.equal(check1.status, 200);
  assert.equal(check1.body.data.expiringSoonCount, 1);
  assert.equal(check1.body.data.expiredCount, 1);
  assert.equal(check1.body.data.notifiedCount, 2);
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'EXPIRY'")
      .get(f.admin.user_id).n,
    2,
  );

  const check2 = await f.request(
    '/api/operations/admin/storage/check-retention',
    'POST',
    { withinDays: 7 },
    f.admin.cookie,
  );
  assert.equal(check2.status, 200);
  assert.equal(check2.body.data.notifiedCount, 0);

  // 진행 중 인계가 있는 보관 물품은 폐기 차단 (409 HANDOVER_CONFLICT)
  const stBusy = await f.request(
    '/api/operations/admin/storage',
    'POST',
    { foundReportId: foundBusy.report_id },
    f.admin.cookie,
  );
  await f.request(
    '/api/operations/handovers',
    'POST',
    { foundReportId: foundBusy.report_id, ownershipProof: '케이스 스티커' },
    f.owner.cookie,
  );
  const blockedDispose = await f.request(
    `/api/operations/admin/storage/${stBusy.body.data.storage_id}/dispose`,
    'POST',
    { status: 'DISPOSED', dispositionNote: '충돌 테스트' },
    f.admin.cookie,
  );
  assert.equal(blockedDispose.status, 409);
  assert.equal(blockedDispose.body.error.code, 'HANDOVER_CONFLICT');

  // 폐기(DISPOSED) 및 이관(TRANSFERRED) 정상 처리
  const disposed = await f.request(
    `/api/operations/admin/storage/${stExpired.body.data.storage_id}/dispose`,
    'POST',
    { status: 'DISPOSED', dispositionNote: '보관 기한 경과 자체 폐기' },
    f.admin.cookie,
  );
  assert.equal(disposed.status, 200);
  assert.equal(disposed.body.data.status, 'DISPOSED');
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(foundExpired.report_id)
      .status,
    'DISPOSED',
  );

  const transferred = await f.request(
    `/api/operations/admin/storage/${stSoon.body.data.storage_id}/dispose`,
    'POST',
    { status: 'TRANSFERRED', dispositionNote: '관할 경찰서 이관' },
    f.admin.cookie,
  );
  assert.equal(transferred.status, 200);
  assert.equal(transferred.body.data.status, 'TRANSFERRED');
  assert.equal(
    f.db.prepare('SELECT status FROM reports WHERE report_id = ?').get(foundSoon.report_id).status,
    'TRANSFERRED',
  );

  // 이미 종료된 보관 물품 재처리 차단 (409)
  assert.equal(
    (
      await f.request(
        `/api/operations/admin/storage/${stExpired.body.data.storage_id}/dispose`,
        'POST',
        { status: 'TRANSFERRED', dispositionNote: '중복 처리' },
        f.admin.cookie,
      )
    ).status,
    409,
  );
});

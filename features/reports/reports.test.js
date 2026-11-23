// [B] 메모리 DB와 임시 업로드 폴더로 분실·습득 신고 API와 사진 검증을 검사합니다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../shared/backend/database.js';
import { initializeDatabase } from '../../shared/backend/init-db.js';
import { createApp } from '../../shared/backend/server.js';
import { promoteAdmin } from '../account/backend/admin.cli.js';

const PASSWORD = 'test-password-123';

// 유효한 최소 PNG·JPEG 바이트를 Data URL로 만들어 사진 업로드 테스트에 사용합니다.
const TINY_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const TINY_JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BYTES.toString('base64')}`;
const TINY_JPG_DATA_URL = `data:image/jpeg;base64,${TINY_JPG_BYTES.toString('base64')}`;

// 각 테스트마다 독립된 메모리 DB, 임시 업로드 폴더, HTTP 서버를 준비하고 종료 시 정리합니다.
async function fixture(t) {
  const db = openDatabase(':memory:');
  initializeDatabase(db);

  const uploadDir = mkdtempSync(join(tmpdir(), 'lf-reports-test-'));
  const prevUploadDir = process.env.REPORT_UPLOAD_DIR;
  process.env.REPORT_UPLOAD_DIR = uploadDir;

  const app = createApp({ db });
  let server;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    if (prevUploadDir === undefined) {
      delete process.env.REPORT_UPLOAD_DIR;
    } else {
      process.env.REPORT_UPLOAD_DIR = prevUploadDir;
    }
    rmSync(uploadDir, { recursive: true, force: true });
  });

  // 공통 JSON API 호출 도우미입니다.
  async function apiRequest(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      json: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      headers: response.headers,
    };
  }

  // 회원가입 후 로그인 쿠키와 사용자 정보를 반환합니다.
  async function createSignedInUser(loginId, { admin = false } = {}) {
    const signup = await apiRequest('/api/account/signup', {
      method: 'POST',
      body: {
        loginId,
        email: `${loginId}@example.invalid`,
        name: `회원_${loginId}`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    });
    assert.equal(signup.status, 201);

    if (admin) {
      promoteAdmin(db, loginId);
    }

    const login = await apiRequest('/api/account/login', {
      method: 'POST',
      body: { loginId, password: PASSWORD },
    });
    assert.equal(login.status, 200);
    return { user: login.json.data, cookie: login.cookie };
  }

  return { db, base, uploadDir, apiRequest, createSignedInUser };
}

// health 응답 유지, 비로그인 차단, JSON 헤더 필수 규칙을 확인합니다.
test('health check stays compatible and protected report endpoints require auth and JSON', async (t) => {
  const f = await fixture(t);

  const health = await f.apiRequest('/api/reports/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.json, { feature: 'reports', status: 'ok', stage: 'routing-only' });

  for (const [method, path, body] of [
    ['POST', '/api/reports', {}],
    ['GET', '/api/reports/mine', undefined],
    ['GET', '/api/reports/1', undefined],
    ['PATCH', '/api/reports/1', {}],
    ['DELETE', '/api/reports/1', {}],
    ['GET', '/api/reports/admin', undefined],
  ]) {
    const res = await f.apiRequest(path, { method, body });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.json.error.code, 'UNAUTHENTICATED');
  }

  const noJson = await fetch(f.base + '/api/reports', { method: 'POST' });
  assert.equal(noJson.status, 415);
  assert.equal((await noJson.json()).error.code, 'JSON_REQUIRED');
});

// 분실·습득 신고 등록, 사진 저장·조회, 입력 검증, 신고 제한 차단을 확인합니다.
test('create LOST/FOUND reports with photos, enforce validation, and block restricted users', async (t) => {
  const f = await fixture(t);
  const member = await f.createSignedInUser('reporter01');
  const admin = await f.createSignedInUser('admin01', { admin: true });

  // 1) 분실물 등록 + 사진 2장 저장 + 클라이언트 authorId 주입 무시 확인
  const lostRes = await f.apiRequest('/api/reports', {
    method: 'POST',
    cookie: member.cookie,
    body: {
      authorId: 9999,
      reportType: 'LOST',
      itemName: '검정 가죽 지갑',
      category: '지갑',
      place: '상도동',
      occurredAt: '2026-11-20',
      description: '안쪽에 학생증이 있습니다.',
      photos: [TINY_PNG_DATA_URL, TINY_JPG_DATA_URL],
    },
  });
  assert.equal(lostRes.status, 201);
  assert.equal(lostRes.json.data.author_id, member.user.user_id);
  assert.equal(lostRes.json.data.report_type, 'LOST');
  assert.equal(lostRes.json.data.status, 'REPORTED');
  assert.equal(lostRes.json.data.occurred_at, '2026-11-20T00:00:00.000Z');
  assert.equal(lostRes.json.data.photos.length, 2);

  // 저장된 사진이 같은 출처 URL로 조회되고 원본 바이트가 일치하는지 확인합니다.
  const firstPhotoUrl = lostRes.json.data.photos[0].photo_url;
  assert.match(firstPhotoUrl, /^\/api\/reports\/photos\/[a-f0-9]{24}\.png$/);
  const photoRes = await fetch(f.base + firstPhotoUrl);
  assert.equal(photoRes.status, 200);
  assert.equal(photoRes.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await photoRes.arrayBuffer()), TINY_PNG_BYTES);

  // 잘못된 파일명이나 상위 경로 접근은 404를 반환해야 합니다.
  const badPhoto = await f.apiRequest('/api/reports/photos/..%2Fsecret.png');
  assert.equal(badPhoto.status, 404);

  // 2) 습득물 등록 시 storagePlace가 description 앞에 정리되어 저장되는지 확인
  const foundRes = await f.apiRequest('/api/reports', {
    method: 'POST',
    cookie: member.cookie,
    body: {
      reportType: 'FOUND',
      itemName: '흰색 무선 이어폰',
      category: '전자기기',
      place: '사당동',
      occurredAt: '2026-11-21',
      storagePlace: '사당지구대 맡김',
      description: '실리콘 케이스가 씌워져 있습니다.',
    },
  });
  assert.equal(foundRes.status, 201);
  assert.equal(
    foundRes.json.data.description,
    '[보관 장소: 사당지구대 맡김]\n실리콘 케이스가 씌워져 있습니다.',
  );

  // 3) 필수값 누락·잘못된 유형·존재하지 않는 날짜 거부 확인
  for (const badBody of [
    { reportType: 'UNKNOWN', itemName: '지갑', category: '지갑', place: '상도동', occurredAt: '2026-11-20' },
    { reportType: 'LOST', itemName: '   ', category: '지갑', place: '상도동', occurredAt: '2026-11-20' },
    { reportType: 'LOST', itemName: '지갑', category: '지갑', place: '상도동', occurredAt: '2026-02-30' },
  ]) {
    const res = await f.apiRequest('/api/reports', {
      method: 'POST',
      cookie: member.cookie,
      body: badBody,
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'VALIDATION_ERROR');
  }

  // 4) 관리자가 신고 제한을 걸면 등록은 403 REPORT_BLOCKED, 본인 목록 조회는 200 유지
  const blockRes = await f.apiRequest(
    `/api/account/admin/users/${member.user.user_id}/restriction`,
    {
      method: 'PATCH',
      cookie: admin.cookie,
      body: { blocked: true, reason: '허위 신고 반복' },
    },
  );
  assert.equal(blockRes.status, 200);

  const blockedCreate = await f.apiRequest('/api/reports', {
    method: 'POST',
    cookie: member.cookie,
    body: {
      reportType: 'LOST',
      itemName: '우산',
      category: '기타',
      place: '흑석동',
      occurredAt: '2026-11-21',
    },
  });
  assert.equal(blockedCreate.status, 403);
  assert.equal(blockedCreate.json.error.code, 'REPORT_BLOCKED');

  const mineWhileBlocked = await f.apiRequest('/api/reports/mine', { cookie: member.cookie });
  assert.equal(mineWhileBlocked.status, 200);
  assert.equal(mineWhileBlocked.json.data.total, 2);
});

// 내 신고 조회, 본인 소유권 검사, 수정(유형 변경 금지·보관 장소 중복 방지), 논리 삭제를 확인합니다.
test('my reports enforce ownership, block report_type changes, avoid duplicate storage prefix, and soft delete', async (t) => {
  const f = await fixture(t);
  const owner = await f.createSignedInUser('owner01');
  const other = await f.createSignedInUser('other01');

  const created = await f.apiRequest('/api/reports', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      reportType: 'FOUND',
      itemName: '파란색 백팩',
      category: '가방',
      place: '노량진동',
      occurredAt: '2026-11-18',
      storagePlace: '노량진역 유실물센터',
      description: '앞주머니에 열쇠고리가 있습니다.',
    },
  });
  assert.equal(created.status, 201);
  const reportId = created.json.data.report_id;

  // 타인은 본인 목록에서 볼 수 없고 단건 조회·수정·삭제 모두 403이어야 합니다.
  const otherMine = await f.apiRequest('/api/reports/mine', { cookie: other.cookie });
  assert.equal(otherMine.status, 200);
  assert.equal(otherMine.json.data.total, 0);

  assert.equal((await f.apiRequest(`/api/reports/${reportId}`, { cookie: other.cookie })).status, 403);
  assert.equal(
    (
      await f.apiRequest(`/api/reports/${reportId}`, {
        method: 'PATCH',
        cookie: other.cookie,
        body: {
          itemName: '변조 시도',
          category: '가방',
          place: '노량진동',
          occurredAt: '2026-11-18',
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.apiRequest(`/api/reports/${reportId}`, {
        method: 'DELETE',
        cookie: other.cookie,
        body: {},
      })
    ).status,
    403,
  );

  // 등록된 신고의 reportType 변경 시도는 400으로 거부해야 합니다.
  const typeChange = await f.apiRequest(`/api/reports/${reportId}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: {
      reportType: 'LOST',
      itemName: '파란색 백팩',
      category: '가방',
      place: '노량진동',
      occurredAt: '2026-11-18',
    },
  });
  assert.equal(typeChange.status, 400);

  // 습득물 수정 시 기존 [보관 장소: ...] 문구가 중복으로 붙지 않아야 합니다.
  const edited = await f.apiRequest(`/api/reports/${reportId}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: {
      itemName: '네이비 백팩',
      category: '가방',
      place: '흑석동',
      occurredAt: '2026-11-19',
      storagePlace: '흑석지구대',
      description: '[보관 장소: 노량진역 유실물센터]\n지퍼 손잡이가 은색입니다.',
    },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.data.item_name, '네이비 백팩');
  assert.equal(edited.json.data.place, '흑석동');
  assert.equal(
    edited.json.data.description,
    '[보관 장소: 흑석지구대]\n지퍼 손잡이가 은색입니다.',
  );

  // 논리 삭제 후 DB 행은 deleted_at이 채워진 채 유지되고 API 조회에서는 제외됩니다.
  const removed = await f.apiRequest(`/api/reports/${reportId}`, {
    method: 'DELETE',
    cookie: owner.cookie,
    body: {},
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.json.data.deleted, true);

  const rawRow = f.db.prepare('SELECT deleted_at FROM reports WHERE report_id = ?').get(reportId);
  assert.ok(rawRow.deleted_at);

  assert.equal((await f.apiRequest(`/api/reports/${reportId}`, { cookie: owner.cookie })).status, 404);
  const mineAfterDelete = await f.apiRequest('/api/reports/mine', { cookie: owner.cookie });
  assert.equal(mineAfterDelete.json.data.total, 0);
});

// 관리자 신고 목록·필터·상태 변경·삭제·감사 이력과 일반 사용자 차단을 확인합니다.
test('admin can list, filter, update status, delete reports with audit logs while regular users are forbidden', async (t) => {
  const f = await fixture(t);
  const member = await f.createSignedInUser('user02');
  const admin = await f.createSignedInUser('admin02', { admin: true });

  const created = await f.apiRequest('/api/reports', {
    method: 'POST',
    cookie: member.cookie,
    body: {
      reportType: 'LOST',
      itemName: '체크카드',
      category: '카드',
      place: '동작동',
      occurredAt: '2026-11-20',
    },
  });
  const reportId = created.json.data.report_id;

  // 일반 사용자는 관리자 신고 API에 접근할 수 없습니다.
  assert.equal((await f.apiRequest('/api/reports/admin', { cookie: member.cookie })).status, 403);
  assert.equal(
    (
      await f.apiRequest(`/api/reports/admin/${reportId}/status`, {
        method: 'PATCH',
        cookie: member.cookie,
        body: { status: 'RECEIVED' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.apiRequest(`/api/reports/admin/${reportId}`, {
        method: 'DELETE',
        cookie: member.cookie,
        body: {},
      })
    ).status,
    403,
  );

  // 관리자는 상태 변경·필터 조회·삭제를 수행할 수 있고 감사 이력이 남습니다.
  const badStatus = await f.apiRequest(`/api/reports/admin/${reportId}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'INVALID_STATUS' },
  });
  assert.equal(badStatus.status, 400);

  const statusChanged = await f.apiRequest(`/api/reports/admin/${reportId}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'STORED' },
  });
  assert.equal(statusChanged.status, 200);
  assert.equal(statusChanged.json.data.status, 'STORED');

  const filtered = await f.apiRequest('/api/reports/admin?status=STORED&reportType=LOST', {
    cookie: admin.cookie,
  });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.json.data.total, 1);
  assert.equal(filtered.json.data.items[0].author_login_id, 'user02');

  const adminDeleted = await f.apiRequest(`/api/reports/admin/${reportId}`, {
    method: 'DELETE',
    cookie: admin.cookie,
    body: {},
  });
  assert.equal(adminDeleted.status, 200);

  const afterDelete = await f.apiRequest('/api/reports/admin', { cookie: admin.cookie });
  assert.equal(afterDelete.json.data.total, 0);

  const actions = f.db
    .prepare("SELECT action FROM audit_logs WHERE target_type = 'REPORT' AND target_id = ? ORDER BY log_id")
    .all(reportId)
    .map((row) => row.action);
  assert.deepEqual(actions, ['CREATE', 'STATUS_CHANGE', 'ADMIN_DELETE']);
});

// 사진 개수·형식·시그니처·외부 경로 오류 검증과 실패 시 임시 파일 정리를 확인합니다.
test('photo upload rejects invalid formats, signatures, external URLs, and cleans up on failure', async (t) => {
  const f = await fixture(t);
  const member = await f.createSignedInUser('photo01');

  const baseBody = {
    reportType: 'LOST',
    itemName: '테스트 물품',
    category: '기타',
    place: '상도동',
    occurredAt: '2026-11-20',
  };

  const fakePng = `data:image/png;base64,${Buffer.from('not-a-real-png').toString('base64')}`;
  const gifData = `data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}`;

  for (const photos of [
    'not-an-array',
    [TINY_PNG_DATA_URL, TINY_PNG_DATA_URL, TINY_PNG_DATA_URL, TINY_PNG_DATA_URL],
    [gifData],
    [TINY_PNG_DATA_URL, fakePng],
    ['https://example.invalid/hack.png'],
    ['/api/reports/../secret.png'],
  ]) {
    const res = await f.apiRequest('/api/reports', {
      method: 'POST',
      cookie: member.cookie,
      body: { ...baseBody, photos },
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error.code, 'VALIDATION_ERROR');
  }

  // 중간에 실패한 요청(정상 PNG + 위조 PNG)에서도 고아 파일이 남지 않아야 합니다.
  assert.equal(readdirSync(f.uploadDir).length, 0);
});

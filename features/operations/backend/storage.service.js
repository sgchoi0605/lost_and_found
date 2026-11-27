// [D] 물품 보관 접수·수정·폐기·이관 및 보관 기한 점검 규칙을 처리합니다.

import { HttpError } from '../../../shared/backend/error.middleware.js';
import { recordAudit, transaction } from '../../../shared/backend/audit.service.js';
import { invalidateReportCandidates } from '../../discovery/backend/match-lifecycle.service.js';
import {
  DEFAULT_EXPIRY_WARNING_DAYS,
  DEFAULT_RETENTION_DAYS,
  calculateStorageDeadline,
  checkRetentionAndNotify,
  classifyRetention,
} from './retention.job.js';
import {
  disposeStorageRecord,
  findStorageByFoundReportId,
  findStorageById,
  insertStorageRecord,
  listStorageCandidates,
  listStorageRecords,
  updateStorageRecord,
} from './storage.repository.js';

export const STORAGE_STATUSES = ['STORED', 'HANDED_OVER', 'DISPOSED', 'TRANSFERRED'];

const INTAKE_ALLOWED_REPORT_STATUSES = [
  'REPORTED',
  'RECEIVED',
  'STORED',
  'MATCHED',
  'HANDOVER_IN_PROGRESS',
];
const DISPOSITION_STATUSES = ['DISPOSED', 'TRANSFERRED'];
const RETENTION_FILTERS = ['NORMAL', 'EXPIRING_SOON', 'EXPIRED'];
const DAY_MS = 24 * 60 * 60 * 1000;

function invalid(message) {
  throw new HttpError(400, 'VALIDATION_ERROR', message);
}

function readPositiveId(value, label = 'ID') {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    invalid(`유효한 ${label}가 필요합니다.`);
  }
  return Number(value);
}

function readText(value, label, min, max) {
  if (typeof value !== 'string') {
    invalid(`${label}을(를) 입력해주세요.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    invalid(`${label}은(는) ${min}~${max}자로 입력해주세요.`);
  }
  return trimmed;
}

function readOptionalText(value, label, max) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value !== 'string') {
    invalid(`${label} 형식이 올바르지 않습니다.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    invalid(`${label}은(는) ${max}자 이하로 입력해주세요.`);
  }
  return trimmed;
}

function readPagination(query = {}) {
  const page = query.page === undefined ? 1 : readPositiveId(query.page, '페이지');
  const limit = query.limit === undefined ? 20 : readPositiveId(query.limit, '조회 개수');
  if (limit > 100 || page > 100000) {
    invalid('페이지 또는 조회 개수가 허용 범위를 초과했습니다.');
  }
  return { page, limit, offset: (page - 1) * limit };
}

function readIsoDateTime(value, label, fallbackIso = null) {
  if (value === undefined || value === null || value === '') {
    return fallbackIso;
  }
  if (typeof value !== 'string') {
    invalid(`${label} 형식이 올바르지 않습니다.`);
  }
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      invalid(`올바른 ${label}을(를) 입력해주세요.`);
    }
    return parsed.toISOString();
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    invalid(`${label} 형식이 올바르지 않습니다.`);
  }
  return new Date(timestamp).toISOString();
}

function readBoundedInt(value, label, min, max, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const num = readPositiveId(value, label);
  if (num < min || num > max) {
    invalid(`${label}은(는) ${min}~${max} 사이의 정수여야 합니다.`);
  }
  return num;
}

function enrichStorageRecord(record, nowIso, withinDays = DEFAULT_EXPIRY_WARNING_DAYS) {
  return {
    ...record,
    ...classifyRetention(record, nowIso, withinDays),
  };
}

// 습득물을 보관 기록(storage_records)에 접수합니다. 보관 장소 미입력 시 reports.storage_place를 초기값으로 사용합니다.
export function registerStorage(db, adminUser, body = {}) {
  const foundReportId = readPositiveId(body.foundReportId, '습득 신고 ID');
  const requestedPlace = readOptionalText(body.storagePlace, '보관 장소', 200);
  const nowIso = new Date().toISOString();
  const storedAt = readIsoDateTime(body.storedAt, '보관 시작 일시', nowIso);
  const explicitDeadline = readIsoDateTime(body.storageDeadline, '보관 기한', null);
  const retentionDays = readBoundedInt(
    body.retentionDays,
    '보관 기간(일)',
    1,
    3650,
    DEFAULT_RETENTION_DAYS,
  );
  const storageDeadline = explicitDeadline || calculateStorageDeadline(storedAt, retentionDays);

  if (Date.parse(storageDeadline) <= Date.parse(storedAt)) {
    invalid('보관 기한은 보관 시작 일시보다 이후여야 합니다.');
  }

  return transaction(db, () => {
    const found = db
      .prepare('SELECT * FROM reports WHERE report_id = ? AND deleted_at IS NULL')
      .get(foundReportId);
    if (!found) {
      throw new HttpError(404, 'REPORT_NOT_FOUND', '습득 신고를 찾을 수 없습니다.');
    }
    if (found.report_type !== 'FOUND') {
      invalid('습득 신고만 보관 등록할 수 있습니다.');
    }
    if (findStorageByFoundReportId(db, foundReportId)) {
      throw new HttpError(409, 'STORAGE_ALREADY_EXISTS', '이미 보관 기록이 등록된 습득물입니다.');
    }
    if (!INTAKE_ALLOWED_REPORT_STATUSES.includes(found.status)) {
      throw new HttpError(
        409,
        'INVALID_REPORT_STATUS',
        '이미 인계·폐기·이관이 완료된 습득물은 보관 등록할 수 없습니다.',
      );
    }

    const storagePlace = requestedPlace || (found.storage_place || '').trim();
    if (!storagePlace) {
      invalid('보관 장소를 입력해주세요.');
    }

    const storageId = insertStorageRecord(db, {
      foundReportId,
      storagePlace,
      storedAt,
      storageDeadline,
    });

    if (found.status === 'REPORTED' || found.status === 'RECEIVED') {
      db.prepare(
        "UPDATE reports SET status = 'STORED', updated_at = ? WHERE report_id = ? AND deleted_at IS NULL",
      ).run(nowIso, foundReportId);
    }

    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'REPORT',
      targetId: foundReportId,
      action: 'STORAGE_CREATE',
      detail: {
        storageId,
        storagePlace,
        storedAt,
        storageDeadline,
        previousStatus: found.status,
      },
    });

    return enrichStorageRecord(findStorageById(db, storageId), nowIso);
  });
}

// 관리자용 보관 물품 목록·검색·필터 및 상태별 집계를 조회합니다.
export function getAdminStorageList(db, query = {}) {
  const paging = readPagination(query);
  const status =
    query.status && query.status !== 'all'
      ? STORAGE_STATUSES.includes(query.status)
        ? query.status
        : invalid('허용되지 않는 보관 상태입니다.')
      : undefined;
  const retention =
    query.retention && query.retention !== 'all'
      ? RETENTION_FILTERS.includes(query.retention)
        ? query.retention
        : invalid('허용되지 않는 보관 기한 필터입니다.')
      : undefined;
  const q = readOptionalText(query.q, '검색어', 100);
  const withinDays = readBoundedInt(
    query.withinDays,
    '임박 기준 일수',
    1,
    90,
    DEFAULT_EXPIRY_WARNING_DAYS,
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const warningCutoffIso = new Date(now.getTime() + withinDays * DAY_MS).toISOString();
  const result = listStorageRecords(db, {
    status,
    retention,
    q,
    nowIso,
    warningCutoffIso,
    ...paging,
  });

  return {
    items: result.items.map((item) => enrichStorageRecord(item, nowIso, withinDays)),
    total: result.total,
    summary: result.summary,
    page: paging.page,
    limit: paging.limit,
  };
}

// 보관 기록이 아직 없는 습득 신고 목록을 조회합니다.
export function getAdminStorageCandidates(db, query = {}) {
  const paging = readPagination(query);
  const q = readOptionalText(query.q, '검색어', 100);
  const result = listStorageCandidates(db, { q, ...paging });
  return { ...result, page: paging.page, limit: paging.limit };
}

// 보관 중인 물품의 보관 장소·기한만 수정합니다. B의 reports 핵심 필드는 변경하지 않습니다.
export function updateStorageInfo(db, adminUser, idParam, body = {}) {
  const storageId = readPositiveId(idParam, '보관 ID');
  const hasPlace = body.storagePlace !== undefined;
  const hasDeadline = body.storageDeadline !== undefined;
  if (!hasPlace && !hasDeadline) {
    invalid('수정할 보관 장소 또는 보관 기한을 입력해주세요.');
  }

  return transaction(db, () => {
    const existing = findStorageById(db, storageId);
    if (!existing) {
      throw new HttpError(404, 'STORAGE_NOT_FOUND', '보관 기록을 찾을 수 없습니다.');
    }
    if (existing.status !== 'STORED') {
      throw new HttpError(
        409,
        'INVALID_STORAGE_STATUS',
        '보관 중인 물품만 보관 정보를 수정할 수 있습니다.',
      );
    }

    const storagePlace = hasPlace
      ? readText(body.storagePlace, '보관 장소', 1, 200)
      : existing.storage_place;
    const storageDeadline = hasDeadline
      ? readIsoDateTime(body.storageDeadline, '보관 기한', null)
      : existing.storage_deadline;

    if (!storageDeadline || Date.parse(storageDeadline) <= Date.parse(existing.stored_at)) {
      invalid('보관 기한은 보관 시작 일시보다 이후여야 합니다.');
    }

    const nowIso = new Date().toISOString();
    updateStorageRecord(db, storageId, {
      storagePlace,
      storageDeadline,
      updatedAt: nowIso,
    });

    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'REPORT',
      targetId: existing.found_report_id,
      action: 'STORAGE_UPDATE',
      detail: {
        storageId,
        previousStoragePlace: existing.storage_place,
        storagePlace,
        previousStorageDeadline: existing.storage_deadline,
        storageDeadline,
      },
    });

    return enrichStorageRecord(findStorageById(db, storageId), nowIso);
  });
}

// 보관 물품을 폐기(DISPOSED) 또는 이관(TRANSFERRED) 처리하고 신고 상태·후보 매칭·이력을 동기화합니다.
export function disposeStorageItem(db, adminUser, idParam, body = {}) {
  const storageId = readPositiveId(idParam, '보관 ID');
  if (typeof body.status !== 'string' || !DISPOSITION_STATUSES.includes(body.status)) {
    invalid('처리 상태는 DISPOSED 또는 TRANSFERRED여야 합니다.');
  }
  const nextStatus = body.status;
  const dispositionNote = readText(body.dispositionNote, '처리 사유', 1, 500);
  const nowIso = new Date().toISOString();
  const disposedAt = readIsoDateTime(body.disposedAt, '처리 일시', nowIso);

  return transaction(db, () => {
    const existing = findStorageById(db, storageId);
    if (!existing) {
      throw new HttpError(404, 'STORAGE_NOT_FOUND', '보관 기록을 찾을 수 없습니다.');
    }
    if (existing.status !== 'STORED') {
      throw new HttpError(
        409,
        'INVALID_STORAGE_STATUS',
        '보관 중인 물품만 폐기 또는 이관 처리할 수 있습니다.',
      );
    }

    const activeHandover = db
      .prepare(
        `SELECT request_id
         FROM handover_requests
         WHERE found_report_id = ? AND status <> 'REJECTED'
         LIMIT 1`,
      )
      .get(existing.found_report_id);
    if (activeHandover) {
      throw new HttpError(
        409,
        'HANDOVER_CONFLICT',
        '진행 중이거나 완료된 인계 신청이 있는 물품은 폐기·이관할 수 없습니다.',
      );
    }

    const confirmedMatch = db
      .prepare(
        `SELECT match_id
         FROM matches
         WHERE found_report_id = ? AND status = 'CONFIRMED'
         LIMIT 1`,
      )
      .get(existing.found_report_id);
    if (confirmedMatch) {
      throw new HttpError(
        409,
        'MATCH_CONFLICT',
        '확정된 매칭이 있는 물품입니다. 매칭 해제 후 폐기·이관해주세요.',
      );
    }

    invalidateReportCandidates(db, existing.found_report_id, adminUser.user_id);

    disposeStorageRecord(db, storageId, {
      status: nextStatus,
      dispositionNote,
      disposedAt,
      updatedAt: nowIso,
    });

    db.prepare(
      'UPDATE reports SET status = ?, updated_at = ? WHERE report_id = ? AND deleted_at IS NULL',
    ).run(nextStatus, nowIso, existing.found_report_id);

    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'REPORT',
      targetId: existing.found_report_id,
      action: nextStatus === 'DISPOSED' ? 'STORAGE_DISPOSE' : 'STORAGE_TRANSFER',
      detail: {
        storageId,
        previousStatus: existing.status,
        nextStatus,
        dispositionNote,
        disposedAt,
      },
    });

    return enrichStorageRecord(findStorageById(db, storageId), nowIso);
  });
}

// 관리자가 보관 기한 임박·초과 점검과 EXPIRY 알림 발송을 실행합니다.
export function runRetentionCheck(db, adminUser, body = {}) {
  const withinDays = readBoundedInt(
    body.withinDays,
    '임박 기준 일수',
    1,
    90,
    DEFAULT_EXPIRY_WARNING_DAYS,
  );
  return checkRetentionAndNotify(db, {
    actorId: adminUser.user_id,
    withinDays,
  });
}

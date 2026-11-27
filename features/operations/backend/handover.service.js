// [D] 인계 신청·심사·실물 인계 완료의 업무 규칙과 상태 동기화를 처리합니다.

import { HttpError } from '../../../shared/backend/error.middleware.js';
import { recordAudit, transaction } from '../../../shared/backend/audit.service.js';
import { createNotification } from '../../account/backend/notification.service.js';
import {
  findActiveHandoverByFoundReport,
  findActiveHandoverByLostReport,
  findHandoverById,
  findPreviousReportStatuses,
  insertHandover,
  listAdminHandovers,
  listHandoversByRequester,
  updateHandoverComplete,
  updateHandoverReview,
} from './handover.repository.js';

export const HANDOVER_STATUSES = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'];

const APPLY_ALLOWED_FOUND_STATUSES = ['REPORTED', 'RECEIVED', 'STORED', 'MATCHED'];
const APPLY_ALLOWED_LOST_STATUSES = ['REPORTED', 'RECEIVED', 'MATCHED'];
const REVIEW_TRANSITIONS = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
};

const HANDOVER_STATUS_PATH = '/features/operations/frontend/handover-status.html';

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

function readHandoverStatus(value) {
  if (typeof value !== 'string' || !HANDOVER_STATUSES.includes(value)) {
    invalid('허용되지 않는 인계 신청 상태입니다.');
  }
  return value;
}

function readIsoDateTime(value, label, fallbackIso) {
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

function findActiveReport(db, reportId) {
  return (
    db
      .prepare('SELECT * FROM reports WHERE report_id = ? AND deleted_at IS NULL')
      .get(reportId) || null
  );
}

function setReportStatus(db, reportId, status, now) {
  db.prepare(
    'UPDATE reports SET status = ?, updated_at = ? WHERE report_id = ? AND deleted_at IS NULL',
  ).run(status, now, reportId);
}

// 거절 시 인계 신청 이전의 신고 상태로 안전하게 복원합니다.
function resolveFallbackFoundStatus(db, foundReportId) {
  const confirmed = db
    .prepare("SELECT 1 FROM matches WHERE found_report_id = ? AND status = 'CONFIRMED' LIMIT 1")
    .get(foundReportId);
  if (confirmed) {
    return 'MATCHED';
  }
  const storage = db
    .prepare("SELECT 1 FROM storage_records WHERE found_report_id = ? AND status = 'STORED' LIMIT 1")
    .get(foundReportId);
  return storage ? 'STORED' : 'RECEIVED';
}

// 습득물에 대한 인계 신청을 등록합니다. 연락처가 있으면 ownership_proof에 함께 저장합니다.
export function createHandoverRequest(db, user, body = {}) {
  const foundReportId = readPositiveId(body.foundReportId, '습득 신고 ID');
  const lostReportId =
    body.lostReportId === undefined || body.lostReportId === null || body.lostReportId === ''
      ? null
      : readPositiveId(body.lostReportId, '분실 신고 ID');

  const proofBody = readText(body.ownershipProof, '소유 증명 내용', 1, 1000);
  const contact = readOptionalText(body.contact, '연락처', 50);
  const ownershipProof = contact ? `[연락처: ${contact}]\n${proofBody}` : proofBody;

  return transaction(db, () => {
    const found = findActiveReport(db, foundReportId);
    if (!found) {
      throw new HttpError(404, 'REPORT_NOT_FOUND', '습득 신고를 찾을 수 없습니다.');
    }
    if (found.report_type !== 'FOUND') {
      throw new HttpError(400, 'VALIDATION_ERROR', '습득 신고에 대해서만 인계 신청할 수 있습니다.');
    }

    const storage = db
      .prepare('SELECT storage_id, status FROM storage_records WHERE found_report_id = ?')
      .get(foundReportId);
    if (storage && storage.status !== 'STORED') {
      throw new HttpError(409, 'STORAGE_CONFLICT', '이미 인계·폐기·이관이 완료된 물품입니다.');
    }

    if (findActiveHandoverByFoundReport(db, foundReportId)) {
      throw new HttpError(
        409,
        'HANDOVER_ALREADY_EXISTS',
        '이미 진행 중이거나 완료된 인계 신청이 있는 물품입니다.',
      );
    }

    if (!APPLY_ALLOWED_FOUND_STATUSES.includes(found.status)) {
      throw new HttpError(
        409,
        'INVALID_REPORT_STATUS',
        '현재 상태의 습득물은 인계 신청할 수 없습니다.',
      );
    }

    let lost = null;
    if (lostReportId !== null) {
      lost = findActiveReport(db, lostReportId);
      if (!lost) {
        throw new HttpError(404, 'REPORT_NOT_FOUND', '연결할 분실 신고를 찾을 수 없습니다.');
      }
      if (lost.report_type !== 'LOST') {
        throw new HttpError(400, 'VALIDATION_ERROR', '연결 신고는 분실 신고여야 합니다.');
      }
      if (lost.author_id !== user.user_id) {
        throw new HttpError(403, 'FORBIDDEN', '본인이 작성한 분실 신고만 연결할 수 있습니다.');
      }
      if (findActiveHandoverByLostReport(db, lostReportId)) {
        throw new HttpError(
          409,
          'HANDOVER_ALREADY_EXISTS',
          '이미 다른 인계 신청에 연결된 분실 신고입니다.',
        );
      }
      if (!APPLY_ALLOWED_LOST_STATUSES.includes(lost.status)) {
        throw new HttpError(
          409,
          'INVALID_REPORT_STATUS',
          '현재 상태의 분실 신고는 인계 신청에 연결할 수 없습니다.',
        );
      }
    }

    const now = new Date().toISOString();
    const requestId = insertHandover(db, {
      foundReportId,
      requesterId: user.user_id,
      lostReportId,
      ownershipProof,
    });

    setReportStatus(db, foundReportId, 'HANDOVER_IN_PROGRESS', now);
    if (lost) {
      setReportStatus(db, lostReportId, 'HANDOVER_IN_PROGRESS', now);
    }

    recordAudit(db, {
      actorId: user.user_id,
      targetType: 'HANDOVER',
      targetId: requestId,
      action: 'HANDOVER_CREATE',
      detail: {
        foundReportId,
        lostReportId,
        previousFoundStatus: found.status,
        previousLostStatus: lost ? lost.status : null,
      },
    });

    if (found.author_id !== user.user_id) {
      createNotification(db, {
        userId: found.author_id,
        type: 'HANDOVER',
        message: `'${found.item_name}' 습득물에 인계 신청이 접수되었습니다.`,
        targetPath: `/features/discovery/frontend/report-detail.html?id=${foundReportId}`,
      });
    }

    return findHandoverById(db, requestId);
  });
}

// 로그인 사용자의 본인 인계 신청 목록을 조회합니다.
export function getMyHandovers(db, user, query = {}) {
  const paging = readPagination(query);
  const status =
    query.status && query.status !== 'all' ? readHandoverStatus(query.status) : undefined;
  const result = listHandoversByRequester(db, user.user_id, { status, ...paging });
  return { ...result, page: paging.page, limit: paging.limit };
}

// 관리자용 전체 인계 신청 목록과 상태별 집계를 조회합니다.
export function getAdminHandovers(db, query = {}) {
  const paging = readPagination(query);
  const status =
    query.status && query.status !== 'all' ? readHandoverStatus(query.status) : undefined;
  const q = readOptionalText(query.q, '검색어', 100);
  const result = listAdminHandovers(db, { status, q, ...paging });
  return { ...result, page: paging.page, limit: paging.limit };
}

// 관리자용 인계 신청 단건 상세를 조회합니다.
export function getAdminHandoverDetail(db, idParam) {
  const requestId = readPositiveId(idParam, '인계 신청 ID');
  const handover = findHandoverById(db, requestId);
  if (!handover) {
    throw new HttpError(404, 'HANDOVER_NOT_FOUND', '인계 신청을 찾을 수 없습니다.');
  }
  return handover;
}

// 관리자가 인계 신청을 검토 중·승인·거절로 정방향 전이합니다.
export function reviewHandoverRequest(db, adminUser, idParam, body = {}) {
  const requestId = readPositiveId(idParam, '인계 신청 ID');
  const nextStatus = readHandoverStatus(body.status);
  const reviewNote = readOptionalText(body.reviewNote, '검토 메모', 500);

  if (nextStatus === 'COMPLETED') {
    throw new HttpError(
      409,
      'INVALID_HANDOVER_TRANSITION',
      '실물 인계 완료는 수령인 정보와 함께 완료 처리 API로 진행해주세요.',
    );
  }

  return transaction(db, () => {
    const existing = findHandoverById(db, requestId);
    if (!existing) {
      throw new HttpError(404, 'HANDOVER_NOT_FOUND', '인계 신청을 찾을 수 없습니다.');
    }

    const allowed = REVIEW_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(nextStatus)) {
      throw new HttpError(
        409,
        'INVALID_HANDOVER_TRANSITION',
        '현재 상태에서는 선택한 상태로 변경할 수 없습니다.',
      );
    }

    const now = new Date().toISOString();
    updateHandoverReview(db, requestId, {
      status: nextStatus,
      reviewerId: adminUser.user_id,
      reviewNote: reviewNote || existing.review_note || null,
      reviewedAt: now,
      updatedAt: now,
    });

    if (nextStatus === 'REJECTED') {
      const previous = findPreviousReportStatuses(db, requestId);
      const restoredFoundStatus =
        previous?.previousFoundStatus &&
        APPLY_ALLOWED_FOUND_STATUSES.includes(previous.previousFoundStatus)
          ? previous.previousFoundStatus
          : resolveFallbackFoundStatus(db, existing.found_report_id);
      setReportStatus(db, existing.found_report_id, restoredFoundStatus, now);

      if (existing.lost_report_id) {
        const restoredLostStatus =
          previous?.previousLostStatus &&
          APPLY_ALLOWED_LOST_STATUSES.includes(previous.previousLostStatus)
            ? previous.previousLostStatus
            : 'RECEIVED';
        setReportStatus(db, existing.lost_report_id, restoredLostStatus, now);
      }
    } else {
      setReportStatus(db, existing.found_report_id, 'HANDOVER_IN_PROGRESS', now);
      if (existing.lost_report_id) {
        setReportStatus(db, existing.lost_report_id, 'HANDOVER_IN_PROGRESS', now);
      }
    }

    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'HANDOVER',
      targetId: requestId,
      action: `HANDOVER_${nextStatus}`,
      detail: {
        from: existing.status,
        to: nextStatus,
        foundReportId: existing.found_report_id,
        lostReportId: existing.lost_report_id,
        reviewNote: reviewNote || null,
      },
    });

    const messages = {
      UNDER_REVIEW: `'${existing.found_item_name}' 인계 신청이 검토 중입니다.`,
      APPROVED: `'${existing.found_item_name}' 인계 신청이 승인되었습니다. 방문 수령을 진행해주세요.`,
      REJECTED: `'${existing.found_item_name}' 인계 신청이 거절되었습니다.`,
    };
    createNotification(db, {
      userId: existing.requester_id,
      type: 'HANDOVER',
      message: messages[nextStatus],
      targetPath: HANDOVER_STATUS_PATH,
    });

    return findHandoverById(db, requestId);
  });
}

// 승인된 인계 신청을 실제 수령인·완료 시각과 함께 인계 완료 처리합니다.
export function completeHandoverRequest(db, adminUser, idParam, body = {}) {
  const requestId = readPositiveId(idParam, '인계 신청 ID');
  const recipientName = readText(body.recipientName, '실제 수령자 이름', 1, 50);
  const now = new Date().toISOString();
  const completedAt = readIsoDateTime(body.completedAt, '인계 완료 일시', now);

  return transaction(db, () => {
    const existing = findHandoverById(db, requestId);
    if (!existing) {
      throw new HttpError(404, 'HANDOVER_NOT_FOUND', '인계 신청을 찾을 수 없습니다.');
    }
    if (existing.status !== 'APPROVED') {
      throw new HttpError(
        409,
        'INVALID_HANDOVER_TRANSITION',
        '승인된 인계 신청만 인계 완료 처리할 수 있습니다.',
      );
    }

    updateHandoverComplete(db, requestId, {
      reviewerId: adminUser.user_id,
      recipientName,
      completedAt,
      updatedAt: now,
    });

    setReportStatus(db, existing.found_report_id, 'HANDED_OVER', now);
    if (existing.lost_report_id) {
      setReportStatus(db, existing.lost_report_id, 'HANDED_OVER', now);
    }

    const storageResult = db
      .prepare(
        `UPDATE storage_records
         SET status = 'HANDED_OVER', updated_at = ?
         WHERE found_report_id = ? AND status = 'STORED'`,
      )
      .run(now, existing.found_report_id);

    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'HANDOVER',
      targetId: requestId,
      action: 'HANDOVER_COMPLETE',
      detail: {
        foundReportId: existing.found_report_id,
        lostReportId: existing.lost_report_id,
        recipientName,
        completedAt,
        storageUpdated: storageResult.changes > 0,
      },
    });

    createNotification(db, {
      userId: existing.requester_id,
      type: 'HANDOVER',
      message: `'${existing.found_item_name}' 물품의 인계가 완료되었습니다.`,
      targetPath: HANDOVER_STATUS_PATH,
    });

    if (existing.found_author_id !== existing.requester_id) {
      createNotification(db, {
        userId: existing.found_author_id,
        type: 'HANDOVER',
        message: `신고하신 습득물 '${existing.found_item_name}'이(가) 소유자에게 인계 완료되었습니다.`,
        targetPath: `/features/discovery/frontend/report-detail.html?id=${existing.found_report_id}`,
      });
    }

    return findHandoverById(db, requestId);
  });
}

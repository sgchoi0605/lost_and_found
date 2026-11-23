// [B] 분실·습득 신고의 입력 검증, 소유권 확인, 상태 변경 및 감사 이력 규칙을 처리합니다.

import { HttpError } from '../../../shared/backend/error.middleware.js';
import { recordAudit, transaction } from '../../../shared/backend/audit.service.js';
import { cleanupSavedPhotos, preparePhotos } from './photo-upload.js';
import {
  findReportById,
  insertReport,
  insertReportPhotos,
  listAdminReports,
  listReportsByAuthor,
  softDeleteReport,
  updateReport,
  updateReportStatus,
} from './report.repository.js';

export const REPORT_TYPES = ['LOST', 'FOUND'];
export const REPORT_STATUSES = [
  'REPORTED',
  'RECEIVED',
  'STORED',
  'MATCHED',
  'HANDOVER_IN_PROGRESS',
  'HANDED_OVER',
  'DISPOSED',
  'TRANSFERRED',
];

const STORAGE_PREFIX_PATTERN = /^\[보관 장소:[^\]]*\]\s*/;

function invalid(message) {
  throw new HttpError(400, 'VALIDATION_ERROR', message);
}

// 문자열의 공백을 정리하고 허용 길이 범위인지 검사합니다.
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

// 선택 입력 문자열을 정리합니다.
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

// 경로 파라미터나 페이지 값을 안전한 양의 정수로 변환합니다.
function readPositiveId(value, label = '신고 ID') {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    invalid(`유효한 ${label}가 필요합니다.`);
  }
  return Number(value);
}

// 목록 조회의 page·limit 값을 공통 계약(기본 1/20, 최대 100)에 맞춰 검증합니다.
function readPagination(query = {}) {
  const page = query.page === undefined ? 1 : readPositiveId(query.page, '페이지');
  const limit = query.limit === undefined ? 20 : readPositiveId(query.limit, '조회 개수');
  if (limit > 100 || page > 100000) {
    invalid('페이지 또는 조회 개수가 허용 범위를 초과했습니다.');
  }
  return { page, limit, offset: (page - 1) * limit };
}

function readReportType(value) {
  if (typeof value !== 'string' || !REPORT_TYPES.includes(value)) {
    invalid('신고 유형은 LOST 또는 FOUND여야 합니다.');
  }
  return value;
}

function readReportStatus(value) {
  if (typeof value !== 'string' || !REPORT_STATUSES.includes(value)) {
    invalid('허용되지 않는 신고 상태입니다.');
  }
  return value;
}

// YYYY-MM-DD 또는 ISO 8601 날짜를 UTC ISO 8601 문자열로 통일합니다.
function readOccurredAt(value) {
  if (typeof value !== 'string' || !value.trim()) {
    invalid('발생 날짜를 입력해주세요.');
  }
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
      invalid('올바른 날짜를 입력해주세요.');
    }
    return parsed.toISOString();
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    invalid('발생 날짜 형식이 올바르지 않습니다.');
  }
  return new Date(timestamp).toISOString();
}

// 습득물 보관 장소가 있으면 기존 보관 장소 문구와 중복되지 않게 description 앞에 정리합니다.
function buildDescription(reportType, description, storagePlace) {
  if (reportType !== 'FOUND' || !storagePlace) {
    return description;
  }
  const cleanedDescription = description.replace(STORAGE_PREFIX_PATTERN, '').trim();
  const header = `[보관 장소: ${storagePlace}]`;
  const combined = cleanedDescription ? `${header}\n${cleanedDescription}` : header;
  if (combined.length > 2000) {
    invalid('특징과 보관 장소 합계는 2000자 이하로 입력해주세요.');
  }
  return combined;
}

// 신고 입력 공통 필드를 검사합니다.
function validateReportFields(body = {}, reportType) {
  const itemName = readText(body.itemName, '물품명', 1, 100);
  const category = readText(body.category, '카테고리', 1, 50);
  const place = readText(body.place, '장소', 1, 100);
  const occurredAt = readOccurredAt(body.occurredAt ?? body.date);
  const rawDescription = readOptionalText(body.description ?? body.details, '특징', 1500);
  const storagePlace =
    reportType === 'FOUND' ? readOptionalText(body.storagePlace, '보관 장소', 200) : '';
  const description = buildDescription(reportType, rawDescription, storagePlace);

  return { itemName, category, place, occurredAt, description };
}

// 분실·습득 신고와 사진을 등록합니다. 작성자는 항상 로그인 사용자(req.user)로 고정합니다.
export function createReport(db, user, body = {}) {
  const reportType = readReportType(body.reportType);
  const fields = validateReportFields(body, reportType);
  const { photoUrls, savedFiles } = preparePhotos(body.photos);

  try {
    return transaction(db, () => {
      const reportId = insertReport(db, {
        authorId: user.user_id,
        reportType,
        ...fields,
      });
      insertReportPhotos(db, reportId, photoUrls);
      recordAudit(db, {
        actorId: user.user_id,
        targetType: 'REPORT',
        targetId: reportId,
        action: 'CREATE',
        detail: { reportType, photoCount: photoUrls.length },
      });
      return findReportById(db, reportId);
    });
  } catch (error) {
    cleanupSavedPhotos(savedFiles);
    throw error;
  }
}

// 로그인 사용자의 본인 신고 목록을 조회합니다.
export function getMyReports(db, user, query = {}) {
  const paging = readPagination(query);
  const result = listReportsByAuthor(db, user.user_id, paging);
  return { ...result, page: paging.page, limit: paging.limit };
}

// 수정 화면용 신고 단건을 조회합니다. 본인 또는 관리자만 접근할 수 있습니다.
export function getReportForEdit(db, user, idParam) {
  const reportId = readPositiveId(idParam);
  const report = findReportById(db, reportId);
  if (!report) {
    throw new HttpError(404, 'REPORT_NOT_FOUND', '신고 내역을 찾을 수 없습니다.');
  }
  if (report.author_id !== user.user_id && user.role !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', '본인이 작성한 신고만 조회할 수 있습니다.');
  }
  return report;
}

// 본인 신고 내용을 수정합니다. report_type 변경은 금지합니다.
export function editMyReport(db, user, idParam, body = {}) {
  const reportId = readPositiveId(idParam);

  return transaction(db, () => {
    const existing = findReportById(db, reportId);
    if (!existing) {
      throw new HttpError(404, 'REPORT_NOT_FOUND', '신고 내역을 찾을 수 없습니다.');
    }
    if (existing.author_id !== user.user_id) {
      throw new HttpError(403, 'FORBIDDEN', '본인이 작성한 신고만 수정할 수 있습니다.');
    }
    if (body.reportType !== undefined && body.reportType !== existing.report_type) {
      invalid('등록된 신고의 유형은 변경할 수 없습니다.');
    }

    const fields = validateReportFields(body, existing.report_type);
    const updatedAt = new Date().toISOString();
    updateReport(db, reportId, { ...fields, updatedAt });
    recordAudit(db, {
      actorId: user.user_id,
      targetType: 'REPORT',
      targetId: reportId,
      action: 'UPDATE',
    });
    return findReportById(db, reportId);
  });
}

// 본인 신고를 논리 삭제합니다.
export function deleteMyReport(db, user, idParam) {
  const reportId = readPositiveId(idParam);

  return transaction(db, () => {
    const existing = findReportById(db, reportId);
    if (!existing) {
      throw new HttpError(404, 'REPORT_NOT_FOUND', '신고 내역을 찾을 수 없습니다.');
    }
    if (existing.author_id !== user.user_id) {
      throw new HttpError(403, 'FORBIDDEN', '본인이 작성한 신고만 삭제할 수 있습니다.');
    }

    softDeleteReport(db, reportId, new Date().toISOString());
    recordAudit(db, {
      actorId: user.user_id,
      targetType: 'REPORT',
      targetId: reportId,
      action: 'DELETE',
    });
    return { report_id: reportId, deleted: true };
  });
}

// 관리자용 전체 신고 목록을 조회합니다.
export function getAdminReports(db, query = {}) {
  const paging = readPagination(query);
  const status =
    query.status && query.status !== 'all' ? readReportStatus(query.status) : undefined;
  const reportType =
    query.reportType && query.reportType !== 'all'
      ? readReportType(query.reportType)
      : undefined;

  const result = listAdminReports(db, { status, reportType, ...paging });
  return { ...result, page: paging.page, limit: paging.limit };
}

// 관리자가 신고 상태를 변경하고 변경 이력을 남깁니다.
export function changeAdminReportStatus(db, adminUser, idParam, body = {}) {
  const reportId = readPositiveId(idParam);
  const nextStatus = readReportStatus(body.status);

  return transaction(db, () => {
    const existing = findReportById(db, reportId);
    if (!existing) {
      throw new HttpError(404, 'REPORT_NOT_FOUND', '신고 내역을 찾을 수 없습니다.');
    }

    updateReportStatus(db, reportId, nextStatus, new Date().toISOString());
    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'REPORT',
      targetId: reportId,
      action: 'STATUS_CHANGE',
      detail: { from: existing.status, to: nextStatus },
    });
    return findReportById(db, reportId);
  });
}

// 관리자가 신고를 논리 삭제하고 삭제 이력을 남깁니다.
export function deleteAdminReport(db, adminUser, idParam) {
  const reportId = readPositiveId(idParam);

  return transaction(db, () => {
    const existing = findReportById(db, reportId);
    if (!existing) {
      throw new HttpError(404, 'REPORT_NOT_FOUND', '신고 내역을 찾을 수 없습니다.');
    }

    softDeleteReport(db, reportId, new Date().toISOString());
    recordAudit(db, {
      actorId: adminUser.user_id,
      targetType: 'REPORT',
      targetId: reportId,
      action: 'ADMIN_DELETE',
    });
    return { report_id: reportId, deleted: true };
  });
}

// [D] 보관 기한 계산과 임박·초과 물품 점검 및 EXPIRY 알림 발송을 처리합니다.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../../../shared/backend/database.js';
import { HttpError } from '../../../shared/backend/error.middleware.js';
import { recordAudit, transaction } from '../../../shared/backend/audit.service.js';
import { createNotification } from '../../account/backend/notification.service.js';

export const DEFAULT_RETENTION_DAYS = 180;
export const DEFAULT_EXPIRY_WARNING_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// 보관 시작 시각에 보관 일수를 더해 보관 기한(UTC ISO)을 계산합니다.
export function calculateStorageDeadline(storedAtIso, retentionDays = DEFAULT_RETENTION_DAYS) {
  const startMs = Date.parse(storedAtIso);
  if (!Number.isFinite(startMs)) {
    throw new HttpError(400, 'VALIDATION_ERROR', '보관 시작 일시 형식이 올바르지 않습니다.');
  }
  return new Date(startMs + retentionDays * DAY_MS).toISOString();
}

// 보관 기록의 잔여 일수와 기한 상태(NORMAL/EXPIRING_SOON/EXPIRED/CLOSED)를 계산합니다.
export function classifyRetention(record, nowIso, withinDays = DEFAULT_EXPIRY_WARNING_DAYS) {
  if (record.status !== 'STORED') {
    return { days_remaining: null, retention_state: 'CLOSED' };
  }
  const deadlineMs = Date.parse(record.storage_deadline);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) {
    return { days_remaining: null, retention_state: 'NORMAL' };
  }
  const diffMs = deadlineMs - nowMs;
  const daysRemaining = Math.ceil(diffMs / DAY_MS);
  if (diffMs <= 0) {
    return { days_remaining: daysRemaining, retention_state: 'EXPIRED' };
  }
  if (diffMs <= withinDays * DAY_MS) {
    return { days_remaining: daysRemaining, retention_state: 'EXPIRING_SOON' };
  }
  return { days_remaining: daysRemaining, retention_state: 'NORMAL' };
}

function hasExistingExpiryAlert(db, foundReportId, storageId, retentionState) {
  const rows = db
    .prepare(
      `SELECT detail_json
       FROM audit_logs
       WHERE target_type = 'REPORT'
         AND target_id = ?
         AND action = 'STORAGE_EXPIRY_ALERT'`,
    )
    .all(foundReportId);

  return rows.some((row) => {
    try {
      const detail = JSON.parse(row.detail_json || 'null');
      return detail?.storageId === storageId && detail?.retentionState === retentionState;
    } catch {
      return false;
    }
  });
}

// 보관 기한 임박·초과 물품을 조회하고 관리자에게 중복 없이 EXPIRY 알림을 발송합니다.
export function checkRetentionAndNotify(
  db,
  { actorId = null, withinDays = DEFAULT_EXPIRY_WARNING_DAYS, now = new Date() } = {},
) {
  if (!Number.isSafeInteger(withinDays) || withinDays < 1 || withinDays > 90) {
    throw new HttpError(400, 'VALIDATION_ERROR', '임박 기준 일수는 1~90 사이의 정수여야 합니다.');
  }

  const nowIso = now.toISOString();
  const warningCutoffIso = new Date(now.getTime() + withinDays * DAY_MS).toISOString();

  return transaction(db, () => {
    const rows = db
      .prepare(
        `SELECT
           s.storage_id,
           s.found_report_id,
           s.storage_place,
           s.stored_at,
           s.storage_deadline,
           s.status,
           r.item_name,
           r.category,
           r.place,
           r.occurred_at
         FROM storage_records s
         JOIN reports r ON r.report_id = s.found_report_id
         WHERE s.status = 'STORED'
           AND r.deleted_at IS NULL
           AND s.storage_deadline <= ?
         ORDER BY s.storage_deadline ASC, s.storage_id ASC`,
      )
      .all(warningCutoffIso);

    const admins = db.prepare("SELECT user_id FROM users WHERE role = 'ADMIN'").all();
    const expiringSoon = [];
    const expired = [];
    let notifiedCount = 0;

    for (const row of rows) {
      const retention = classifyRetention(row, nowIso, withinDays);
      const item = { ...row, ...retention };
      if (retention.retention_state === 'EXPIRED') {
        expired.push(item);
      } else {
        expiringSoon.push(item);
      }

      if (
        admins.length === 0 ||
        hasExistingExpiryAlert(db, row.found_report_id, row.storage_id, retention.retention_state)
      ) {
        continue;
      }

      const message =
        retention.retention_state === 'EXPIRED'
          ? `'${row.item_name}' 보관 기한이 만료되었습니다. 폐기 또는 이관 처리를 확인해주세요.`
          : `'${row.item_name}' 보관 기한이 ${Math.max(1, retention.days_remaining)}일 이내로 임박했습니다.`;
      const targetPath = `/features/operations/frontend/admin-storage.html?storageId=${row.storage_id}`;

      for (const admin of admins) {
        createNotification(db, {
          userId: admin.user_id,
          type: 'EXPIRY',
          message,
          targetPath,
        });
        notifiedCount++;
      }

      recordAudit(db, {
        actorId,
        targetType: 'REPORT',
        targetId: row.found_report_id,
        action: 'STORAGE_EXPIRY_ALERT',
        detail: {
          storageId: row.storage_id,
          retentionState: retention.retention_state,
          storageDeadline: row.storage_deadline,
          adminCount: admins.length,
        },
      });
    }

    return {
      checkedAt: nowIso,
      withinDays,
      expiringSoonCount: expiringSoon.length,
      expiredCount: expired.length,
      notifiedCount,
      expiringSoon,
      expired,
    };
  });
}

// CLI로 직접 실행하면 로컬 DB의 보관 기한을 점검하고 연결을 닫습니다.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db;
  try {
    db = openDatabase();
    const result = checkRetentionAndNotify(db);
    console.log(
      `보관 기한 점검 완료: 임박 ${result.expiringSoonCount}건, 만료 ${result.expiredCount}건, 알림 ${result.notifiedCount}건`,
    );
  } catch (error) {
    console.error(`보관 기한 점검 실패: ${error.message}`);
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

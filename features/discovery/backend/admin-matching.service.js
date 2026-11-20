
import { HttpError } from '../../../shared/backend/error.middleware.js';

import {
    transaction,
    recordAudit
} from '../../../shared/backend/audit.service.js';

import {
    createNotification
} from '../../account/backend/notification.service.js';

import {
    calculateSimilarity
} from './matching.service.js';

const MATCHABLE_STATUSES = [
    'REPORTED',
    'RECEIVED',
    'STORED'
];

const MATCH_STATUSES = [
    'CANDIDATE',
    'CONFIRMED',
    'REJECTED'
];

// 관리자 전체 매칭 목록 조회
export function listAdminMatches(db, {
    status = '',
    page = 1,
    limit = 20
} = {}) {

    if (status && !MATCH_STATUSES.includes(status)) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 매칭 상태입니다.'
        );
    }

    if (
        !Number.isSafeInteger(page) ||
        !Number.isSafeInteger(limit) ||
        page < 1 ||
        limit < 1 ||
        limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)
    ) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 조회 범위입니다.'
        );
    }

    const conditions = [
        'l.deleted_at IS NULL',
        'f.deleted_at IS NULL'
    ];

    const params = [];

    if (status) {
        conditions.push('m.status = ?');
        params.push(status);
    }

    const from = `
        FROM matches m
        JOIN reports l
            ON l.report_id = m.lost_report_id
        JOIN reports f
            ON f.report_id = m.found_report_id
        WHERE ${conditions.join(' AND ')}
    `;

    const { total } = db.prepare(`
        SELECT COUNT(*) AS total
        ${from}
    `).get(...params);

    const rows = db.prepare(`
        SELECT
            m.*,
            l.item_name AS lost_name,
            l.category AS lost_category,
            l.place AS lost_place,
            l.occurred_at AS lost_time,
            l.status AS lost_status,
            f.item_name AS found_name,
            f.category AS found_category,
            f.place AS found_place,
            f.occurred_at AS found_time,
            f.status AS found_status
        ${from}
        ORDER BY m.similarity DESC, m.match_id DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    const items = rows.map(row => {

        const lost = {
            report_id: row.lost_report_id,
            report_type: 'LOST',
            item_name: row.lost_name,
            category: row.lost_category,
            place: row.lost_place,
            occurred_at: row.lost_time,
            status: row.lost_status
        };

        const found = {
            report_id: row.found_report_id,
            report_type: 'FOUND',
            item_name: row.found_name,
            category: row.found_category,
            place: row.found_place,
            occurred_at: row.found_time,
            status: row.found_status
        };

        const comparison =
            calculateSimilarity(lost, found);

        return {
            match_id: row.match_id,
            similarity: row.similarity,
            currentSimilarity: comparison.similarity,
            status: row.status,
            source: row.source,
            reviewed_by: row.reviewed_by,
            reviewed_at: row.reviewed_at,
            created_at: row.created_at,
            reasons: comparison.reasons,
            lost,
            found
        };
    });

    return { items, total, page, limit };
}

// 다른 확정 매칭이 존재하는지 검사
function checkConfirmedConflict(db, match) {

    const conflict = db.prepare(`
        SELECT match_id
        FROM matches
        WHERE status = 'CONFIRMED'
          AND match_id <> ?
          AND (
              lost_report_id = ?
              OR found_report_id = ?
          )
    `).get(
        match.match_id,
        match.lost_report_id,
        match.found_report_id
    );

    if (conflict) {
        throw new HttpError(
            409,
            'MATCH_CONFLICT',
            '이미 다른 물품과 확정된 신고입니다.'
        );
    }
}

// 인계·보관 상태 검사
function checkHandoverConflict(db, match) {

    const handover = db.prepare(`
        SELECT request_id
        FROM handover_requests
        WHERE (
            found_report_id = ?
            OR lost_report_id = ?
        )
        AND status IN (
            'REQUESTED',
            'UNDER_REVIEW',
            'APPROVED',
            'COMPLETED'
        )
    `).get(
        match.found_report_id,
        match.lost_report_id
    );

    if (handover) {
        throw new HttpError(
            409,
            'HANDOVER_CONFLICT',
            '인계 신청이 진행 중이거나 완료된 물품입니다.'
        );
    }

    const storage = db.prepare(`
        SELECT storage_id
        FROM storage_records
        WHERE found_report_id = ?
          AND status <> 'STORED'
    `).get(match.found_report_id);

    if (storage) {
        throw new HttpError(
            409,
            'STORAGE_CONFLICT',
            '보관이 종료된 물품은 변경할 수 없습니다.'
        );
    }
}

// 신고 상태 변경
function updateReportStatus(db, reportId, status, now) {

    db.prepare(`
        UPDATE reports
        SET status = ?, updated_at = ?
        WHERE report_id = ?
    `).run(status, now, reportId);
}

// 매칭 처리 결과 알림
function notifyOwners(db, lost, found, message) {

    createNotification(db, {
        userId: lost.author_id,
        type: 'MATCH',
        message,
        targetPath:
            `/features/discovery/frontend/matches.html?reportId=${lost.report_id}`
    });

    // 같은 사용자가 두 신고를 작성한 경우 중복 알림 방지
    if (lost.author_id !== found.author_id) {

        createNotification(db, {
            userId: found.author_id,
            type: 'MATCH',
            message,
            targetPath:
                `/features/discovery/frontend/matches.html?reportId=${found.report_id}`
        });
    }
}

// 관리자 매칭 확정·거절·해제
export function reviewMatch(db, matchId, adminId, action) {

    if (!['CONFIRM', 'REJECT', 'RELEASE'].includes(action)) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 매칭 처리 명령입니다.'
        );
    }

    return transaction(db, () => {

        const admin = db.prepare(`
            SELECT user_id
            FROM users
            WHERE user_id = ?
              AND role = 'ADMIN'
        `).get(adminId);

        if (!admin) {
            throw new HttpError(
                403,
                'FORBIDDEN',
                '관리자 권한이 필요합니다.'
            );
        }

        const match = db.prepare(`
            SELECT *
            FROM matches
            WHERE match_id = ?
        `).get(matchId);

        if (!match) {
            throw new HttpError(
                404,
                'NOT_FOUND',
                '매칭 결과를 찾을 수 없습니다.'
            );
        }

        const getReport = id => db.prepare(`
            SELECT *
            FROM reports
            WHERE report_id = ?
              AND deleted_at IS NULL
        `).get(id);

        const lost = getReport(match.lost_report_id);
        const found = getReport(match.found_report_id);

        if (!lost || !found) {
            throw new HttpError(
                409,
                'REPORT_UNAVAILABLE',
                '삭제되었거나 존재하지 않는 신고입니다.'
            );
        }

        const now = new Date().toISOString();

        const previousStatus = match.status;

        const previousReportStatuses = {
            lost: lost.status,
            found: found.status
        };

        let nextStatus;
        let notificationMessage;

        // 1. 매칭 확정
        if (action === 'CONFIRM') {

            if (match.status !== 'CANDIDATE') {
                throw new HttpError(
                    409,
                    'INVALID_STATUS',
                    '매칭 후보만 확정할 수 있습니다.'
                );
            }

            checkConfirmedConflict(db, match);
            checkHandoverConflict(db, match);

            if (
                !MATCHABLE_STATUSES.includes(lost.status) ||
                !MATCHABLE_STATUSES.includes(found.status)
            ) {
                throw new HttpError(
                    409,
                    'INVALID_REPORT_STATUS',
                    '현재 신고 상태에서는 확정할 수 없습니다.'
                );
            }

            nextStatus = 'CONFIRMED';

            updateReportStatus(
                db, lost.report_id, 'MATCHED', now
            );

            updateReportStatus(
                db, found.report_id, 'MATCHED', now
            );

            notificationMessage =
                '관리자가 유사 물품 매칭을 확정했습니다.';
        }

        // 2. 매칭 거절
        if (action === 'REJECT') {

            if (match.status !== 'CANDIDATE') {
                throw new HttpError(
                    409,
                    'INVALID_STATUS',
                    '매칭 후보만 거절할 수 있습니다.'
                );
            }

            nextStatus = 'REJECTED';

            notificationMessage =
                '유사 물품 매칭 후보가 관리자 검토 후 거절되었습니다.';
        }

        // 3. 매칭 해제
        if (action === 'RELEASE') {

            if (match.status !== 'CONFIRMED') {
                throw new HttpError(
                    409,
                    'INVALID_STATUS',
                    '확정된 매칭만 해제할 수 있습니다.'
                );
            }

            checkConfirmedConflict(db, match);
            checkHandoverConflict(db, match);

            if (
                lost.status !== 'MATCHED' ||
                found.status !== 'MATCHED'
            ) {
                throw new HttpError(
                    409,
                    'INVALID_REPORT_STATUS',
                    '신고 상태가 변경되어 매칭을 해제할 수 없습니다.'
                );
            }

            // 확정 당시 신고 상태를 활동 기록에서 조회
            const audit = db.prepare(`
                SELECT detail_json
                FROM audit_logs
                WHERE target_type = 'MATCH'
                  AND target_id = ?
                  AND action = 'MATCH_CONFIRM'
                ORDER BY log_id DESC
                LIMIT 1
            `).get(matchId);

            let original = null;

            try {
                original = JSON.parse(
                    audit?.detail_json || 'null'
                )?.previousReportStatuses;
            } catch {
                original = null;
            }

            if (
                !original ||
                !MATCHABLE_STATUSES.includes(original.lost) ||
                !MATCHABLE_STATUSES.includes(original.found)
            ) {
                throw new HttpError(
                    409,
                    'RESTORE_UNAVAILABLE',
                    '확정 이전 신고 상태를 확인할 수 없습니다.'
                );
            }

            updateReportStatus(
                db, lost.report_id, original.lost, now
            );

            updateReportStatus(
                db, found.report_id, original.found, now
            );

            nextStatus = 'CANDIDATE';

            notificationMessage =
                '확정되었던 유사 물품 매칭이 해제되었습니다.';
        }

        // 매칭 상태와 검토 정보 변경
        db.prepare(`
            UPDATE matches
            SET
                status = ?,
                reviewed_by = ?,
                reviewed_at = ?
            WHERE match_id = ?
        `).run(
            nextStatus,
            adminId,
            now,
            matchId
        );

        // 관리자 활동 기록 저장
        recordAudit(db, {
            actorId: adminId,
            targetType: 'MATCH',
            targetId: matchId,
            action: `MATCH_${action}`,
            detail: {
                previousStatus,
                nextStatus,
                previousReportStatuses,
                lostReportId: lost.report_id,
                foundReportId: found.report_id
            }
        });

        // 처리 결과 알림 생성
        notifyOwners(
            db,
            lost,
            found,
            notificationMessage
        );

        return {
            match_id: matchId,
            previousStatus,
            status: nextStatus,
            reviewed_by: adminId,
            reviewed_at: now
        };
    });
}


import { HttpError } from '../../../shared/backend/error.middleware.js';

// 날짜 형식 검증
function validateDate(value) {

    if (typeof value !== 'string') {
        return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

// 관리자 통계 조회
export function getStatistics(db, query = {}) {

    const startDate = query.startDate ?? '';
    const endDate = query.endDate ?? '';
    const reportType = query.reportType ?? '';
    const category = query.category ?? '';

    // 조회 조건 검증
    if (
        (startDate !== '' && !validateDate(startDate)) ||
        (endDate !== '' && !validateDate(endDate))
    ) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 날짜 형식입니다.'
        );
    }

    if (startDate && endDate && startDate > endDate) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '시작일은 종료일보다 늦을 수 없습니다.'
        );
    }

    if (
        reportType !== '' &&
        !['LOST', 'FOUND'].includes(reportType)
    ) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 신고 유형입니다.'
        );
    }

    if (typeof category !== 'string') {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 카테고리입니다.'
        );
    }

    // 삭제된 신고 제외
    const conditions = [
        'deleted_at IS NULL'
    ];

    const params = [];

    // 신고 등록일 기준 기간 필터
    if (startDate) {

        conditions.push(
            'substr(created_at, 1, 10) >= ?'
        );

        params.push(startDate);
    }

    if (endDate) {

        conditions.push(
            'substr(created_at, 1, 10) <= ?'
        );

        params.push(endDate);
    }

    // 신고 유형 필터
    if (reportType) {

        conditions.push('report_type = ?');
        params.push(reportType);
    }

    // 카테고리 필터
    if (category) {

        conditions.push('category = ?');
        params.push(category);
    }

    const where = conditions.join(' AND ');

    // 1. 전체 신고 및 처리 현황
    const summary = db.prepare(`
        SELECT

            COUNT(*) AS totalReports,

            COUNT(
                CASE WHEN report_type = 'LOST'
                THEN 1 END
            ) AS lostReports,

            COUNT(
                CASE WHEN report_type = 'FOUND'
                THEN 1 END
            ) AS foundReports,

            COUNT(
                CASE WHEN status = 'MATCHED'
                THEN 1 END
            ) AS matchedReports,

            COUNT(
                CASE WHEN report_type = 'FOUND'
                    AND status = 'HANDED_OVER'
                THEN 1 END
            ) AS completedFoundReports,

            COUNT(
                CASE WHEN status IN (
                    'REPORTED',
                    'RECEIVED',
                    'STORED',
                    'MATCHED',
                    'HANDOVER_IN_PROGRESS'
                )
                THEN 1 END
            ) AS pendingReports

        FROM reports

        WHERE ${where}

    `).get(...params);

    // 2. 신고 유형별 통계
    const byType = db.prepare(`
        SELECT
            report_type,
            COUNT(*) AS count

        FROM reports

        WHERE ${where}

        GROUP BY report_type

        ORDER BY report_type

    `).all(...params);

    // 3. 카테고리별 통계
    const byCategory = db.prepare(`
        SELECT
            category,

            COUNT(*) AS count,

            COUNT(
                CASE WHEN report_type = 'LOST'
                THEN 1 END
            ) AS lostCount,

            COUNT(
                CASE WHEN report_type = 'FOUND'
                THEN 1 END
            ) AS foundCount

        FROM reports

        WHERE ${where}

        GROUP BY category

        ORDER BY count DESC, category

    `).all(...params);

    // 4. 신고 상태별 통계
    const byStatus = db.prepare(`
        SELECT
            status,
            COUNT(*) AS count

        FROM reports

        WHERE ${where}

        GROUP BY status

        ORDER BY count DESC, status

    `).all(...params);

    // 5. 일별 신고 등록 현황
    const byDate = db.prepare(`
        SELECT

            substr(created_at, 1, 10) AS date,

            COUNT(*) AS count,

            COUNT(
                CASE WHEN report_type = 'LOST'
                THEN 1 END
            ) AS lostCount,

            COUNT(
                CASE WHEN report_type = 'FOUND'
                THEN 1 END
            ) AS foundCount

        FROM reports

        WHERE ${where}

        GROUP BY substr(created_at, 1, 10)

        ORDER BY date

    `).all(...params);

    // 6. 인계 신청 현황
    // 조회 조건에 해당하는 습득 신고의 인계 신청 집계
    const handover = db.prepare(`
        SELECT

            COUNT(*) AS totalRequests,

            COUNT(
                CASE WHEN status = 'REQUESTED'
                THEN 1 END
            ) AS requested,

            COUNT(
                CASE WHEN status = 'UNDER_REVIEW'
                THEN 1 END
            ) AS underReview,

            COUNT(
                CASE WHEN status = 'APPROVED'
                THEN 1 END
            ) AS approved,

            COUNT(
                CASE WHEN status = 'REJECTED'
                THEN 1 END
            ) AS rejected,

            COUNT(
                CASE WHEN status = 'COMPLETED'
                THEN 1 END
            ) AS completed,

            COUNT(
                CASE WHEN status IN (
                    'REQUESTED',
                    'UNDER_REVIEW',
                    'APPROVED'
                )
                THEN 1 END
            ) AS pendingRequests

        FROM handover_requests

        WHERE found_report_id IN (

            SELECT report_id

            FROM reports

            WHERE ${where}
              AND report_type = 'FOUND'
        )

    `).get(...params);

    // 7. 인계 완료율 계산
    const handoverCompletionRate =
        summary.foundReports === 0
            ? null
            : Math.round(
                summary.completedFoundReports /
                summary.foundReports * 10000
            ) / 100;

    // 8. 전체 카테고리 필터 선택지
    const categories = db.prepare(`
        SELECT DISTINCT category

        FROM reports

        WHERE deleted_at IS NULL

        ORDER BY category

    `).all().map(row => row.category);

    return {

        filters: {
            startDate,
            endDate,
            reportType,
            category
        },

        summary: {
            ...summary,
            handoverCompletionRate
        },

        byType,
        byCategory,
        byStatus,
        byDate,
        handover,
        categories
    };
}

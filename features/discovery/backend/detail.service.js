
import { openDatabase } from '../../../shared/backend/database.js';

// 신고 ID를 이용하여 상세 정보 조회
export function getReportDetail(reportId) {
    const db = openDatabase();

    try {
        const report = db.prepare(`
            SELECT
                report_id,
                report_type,
                item_name,
                category,
                place,
                occurred_at,
                description,
                status,
                created_at,
                updated_at
            FROM reports
            WHERE report_id = ?
              AND deleted_at IS NULL
        `).get(reportId);

        // 신고가 존재하지 않는 경우
        if (!report) {
            return null;
        }

        // 신고에 등록된 사진 목록 조회
        const photos = db.prepare(`
            SELECT
                photo_id,
                photo_url,
                sort_order
            FROM report_photos
            WHERE report_id = ?
            ORDER BY sort_order, photo_id
        `).all(reportId);

        return {
            ...report,
            photos
        };

    } finally {
        db.close();
    }
}

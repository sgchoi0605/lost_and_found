
import { searchReports } from './search.service.js';
import { getReportDetail } from './detail.service.js';

// 신고 검색 요청 처리
export function getReports(req, res, next) {
    try {
        const result = searchReports(req.db, req.query);

        res.json({ data: result });
    } catch (error) {
        next(error);
    }
}

// 개별 신고 상세 조회 요청 처리
export function getReport(req, res, next) {
    try {
        const rawId = req.params.id;
        const reportId = Number(rawId);

        // 신고 ID 검증
        if (
            !/^[1-9]\d*$/.test(rawId) ||
            !Number.isSafeInteger(reportId)
        ) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: '잘못된 신고 ID입니다.'
                }
            });
        }

        const report = getReportDetail(req.db, reportId);

        // 존재하지 않거나 삭제된 신고
        if (!report) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND',
                    message: '해당 신고를 찾을 수 없습니다.'
                }
            });
        }

        res.json({ data: report });

    } catch (error) {
        next(error);
    }
}

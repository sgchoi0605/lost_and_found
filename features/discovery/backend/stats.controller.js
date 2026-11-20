
import { getStatistics } from './stats.service.js';

// [C] 관리자 통계 API 요청 처리
export function getAdminStatistics(req, res, next) {

    try {

        const result = getStatistics(
            req.db,
            req.query
        );

        res.json({
            data: result
        });

    } catch (error) {

        next(error);
    }
}

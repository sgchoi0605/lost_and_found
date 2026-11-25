
import {
    calculateSimilarity,
    generateMatchesForReport
} from './matching.service.js';

import { HttpError } from '../../../shared/backend/error.middleware.js';

// 양의 정수 검증
function positiveId(value) {
    const number = Number(value);

    if (
        typeof value !== 'string' ||
        !/^[1-9]\d*$/.test(value) ||
        !Number.isSafeInteger(number)
    ) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 ID 또는 페이지 번호입니다.'
        );
    }

    return number;
}

// 페이지네이션 검증
function pagination(query) {
    const page = positiveId(query.page ?? '1');
    const limit = positiveId(query.limit ?? '20');

    if (
        limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)
    ) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 조회 범위입니다.'
        );
    }

    return {
        page,
        limit,
        offset: (page - 1) * limit
    };
}

// 본인의 매칭 가능한 신고 목록 조회
export function getMyMatchableReports(req, res, next) {
    try {
        const userId = req.user.user_id;
        const { page, limit, offset } = pagination(req.query);

        const where = `
            author_id = ?
            AND deleted_at IS NULL
            AND status IN (
                'REPORTED',
                'RECEIVED',
                'STORED'
            )
        `;

        const { total } = req.db.prepare(`
            SELECT COUNT(*) AS total
            FROM reports
            WHERE ${where}
        `).get(userId);

        const items = req.db.prepare(`
            SELECT
                report_id,
                report_type,
                item_name,
                category,
                place,
                occurred_at,
                status
            FROM reports
            WHERE ${where}
            ORDER BY report_id DESC
            LIMIT ? OFFSET ?
        `).all(userId, limit, offset);

        res.json({
            data: { items, total, page, limit }
        });

    } catch (error) {
        next(error);
    }
}

// 본인의 신고에 대한 매칭 후보 생성
export function createMatches(req, res, next) {
    try {
        const reportId = positiveId(req.params.id);

        const result = generateMatchesForReport(
            req.db,
            reportId,
            req.user.user_id
        );

        res.json({ data: result });

    } catch (error) {
        next(error);
    }
}

// 본인의 매칭 결과 조회
export function getMatches(req, res, next) {
    try {
        const userId = req.user.user_id;
        const { page, limit, offset } = pagination(req.query);

        const conditions = [
            '(l.author_id = ? OR f.author_id = ?)',
            'l.deleted_at IS NULL',
            'f.deleted_at IS NULL',
            "m.status IN ('CANDIDATE', 'CONFIRMED')"
        ];

        const params = [userId, userId];

        // 특정 신고의 매칭 결과만 조회
        if (req.query.reportId !== undefined) {
            const reportId = positiveId(req.query.reportId);

            const owned = req.db.prepare(`
                SELECT report_id
                FROM reports
                WHERE report_id = ?
                  AND author_id = ?
                  AND deleted_at IS NULL
            `).get(reportId, userId);

            if (!owned) {
                throw new HttpError(
                    404,
                    'NOT_FOUND',
                    '본인의 신고를 찾을 수 없습니다.'
                );
            }

            conditions.push(`
                (m.lost_report_id = ? OR m.found_report_id = ?)
            `);

            params.push(reportId, reportId);
        }

        const where = conditions.join(' AND ');

        const from = `
            FROM matches m
            JOIN reports l
                ON l.report_id = m.lost_report_id
            JOIN reports f
                ON f.report_id = m.found_report_id
            WHERE ${where}
        `;

        const { total } = req.db.prepare(`
            SELECT COUNT(*) AS total
            ${from}
        `).get(...params);

        const rows = req.db.prepare(`
            SELECT
                m.match_id,
                m.similarity,
                m.status,
                m.source,
                m.created_at,
                l.report_id AS lost_id,
                l.item_name AS lost_name,
                l.category AS lost_category,
                l.place AS lost_place,
                l.occurred_at AS lost_time,
                l.status AS lost_status,
                f.report_id AS found_id,
                f.item_name AS found_name,
                f.category AS found_category,
                f.place AS found_place,
                f.occurred_at AS found_time,
                f.status AS found_status
            ${from}
            ORDER BY m.similarity DESC, m.match_id DESC
            LIMIT ? OFFSET ?
        `).all(...params, limit, offset);

        const items = rows.map(row => {

            const lost = {
                report_id: row.lost_id,
                report_type: 'LOST',
                item_name: row.lost_name,
                category: row.lost_category,
                place: row.lost_place,
                occurred_at: row.lost_time,
                status: row.lost_status
            };

            const found = {
                report_id: row.found_id,
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
                status: row.status,
                source: row.source,
                created_at: row.created_at,
                currentSimilarity: comparison.similarity,
                reasons: comparison.reasons,
                lost,
                found
            };
        });

        res.json({
            data: { items, total, page, limit }
        });

    } catch (error) {
        next(error);
    }
}

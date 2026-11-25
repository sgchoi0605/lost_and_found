
import { HttpError } from '../../../shared/backend/error.middleware.js';

import {
    listAdminMatches,
    reviewMatch
} from './admin-matching.service.js';

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

// 관리자 매칭 목록 조회
export function getAdminMatches(req, res, next) {

    try {

        const status = req.query.status ?? '';
        const page = positiveId(req.query.page ?? '1');
        const limit = positiveId(req.query.limit ?? '20');

        if (typeof status !== 'string') {
            throw new HttpError(
                400,
                'VALIDATION_ERROR',
                '잘못된 매칭 상태입니다.'
            );
        }

        const result = listAdminMatches(req.db, {
            status,
            page,
            limit
        });

        res.json({
            data: result
        });

    } catch (error) {
        next(error);
    }
}

// 관리자 매칭 확정·거절·해제
export function updateAdminMatch(req, res, next) {

    try {

        const matchId = positiveId(req.params.id);
        const action = req.body?.action;

        const result = reviewMatch(
            req.db,
            matchId,
            req.user.user_id,
            action
        );

        res.json({
            data: result
        });

    } catch (error) {
        next(error);
    }
}

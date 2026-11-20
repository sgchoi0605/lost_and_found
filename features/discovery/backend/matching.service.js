
import { openDatabase } from '../../../shared/backend/database.js';
import { HttpError } from '../../../shared/backend/error.middleware.js';
import { createNotification } from '../../account/backend/notification.service.js';

import {
    listMatchableReports,
    insertCandidate
} from './matching.repository.js';

const MATCH_THRESHOLD = 0.6;

const MATCHABLE_STATUSES = [
    'REPORTED',
    'RECEIVED',
    'STORED'
];

// 문자열 정규화
function normalize(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}

// 부분 일치 확인
function partialMatch(a, b) {
    return Boolean(a && b) &&
        (a.includes(b) || b.includes(a));
}

// 분실물과 습득물의 유사도 계산
export function calculateSimilarity(lost, found) {

    let score = 0;
    const reasons = [];

    // 1. 물품 이름 비교
    const lostName = normalize(lost.item_name);
    const foundName = normalize(found.item_name);

    if (lostName && lostName === foundName) {
        score += 40;
        reasons.push('물품 이름 일치');
    } else if (partialMatch(lostName, foundName)) {
        score += 30;
        reasons.push('물품 이름 유사');
    }

    // 2. 카테고리 비교
    const lostCategory = normalize(lost.category);
    const foundCategory = normalize(found.category);

    const sameCategory =
        Boolean(lostCategory) &&
        lostCategory === foundCategory;

    if (sameCategory) {
        score += 30;
        reasons.push('카테고리 일치');
    }

    // 3. 장소 비교
    const lostPlace = normalize(lost.place);
    const foundPlace = normalize(found.place);

    if (lostPlace && lostPlace === foundPlace) {
        score += 20;
        reasons.push('장소 일치');
    } else if (partialMatch(lostPlace, foundPlace)) {
        score += 10;
        reasons.push('장소 유사');
    }

    // 4. 발생 시간 비교
    const lostTime = Date.parse(lost.occurred_at);
    const foundTime = Date.parse(found.occurred_at);

    const hours =
        (foundTime - lostTime) / (1000 * 60 * 60);

    const validTime =
        Number.isFinite(hours) && hours >= 0;

    if (validTime && hours <= 24) {
        score += 10;
        reasons.push('발생 시간 24시간 이내');
    } else if (validTime && hours <= 72) {
        score += 5;
        reasons.push('발생 시간 3일 이내');
    }

    const similarity = score / 100;

    const isCandidate =
        lost.report_type === 'LOST' &&
        found.report_type === 'FOUND' &&
        sameCategory &&
        validTime &&
        similarity >= MATCH_THRESHOLD;

    return {
        score,
        similarity,
        reasons,
        isCandidate
    };
}

// 특정 신고에 대한 유사 물품 매칭 후보 생성
export function generateMatchesForReport(reportId, userId) {

    if (
        !Number.isSafeInteger(reportId) ||
        reportId <= 0 ||
        !Number.isSafeInteger(userId) ||
        userId <= 0
    ) {
        throw new HttpError(
            400,
            'VALIDATION_ERROR',
            '잘못된 신고 또는 사용자 ID입니다.'
        );
    }

    const db = openDatabase();

    try {

        db.exec('BEGIN IMMEDIATE');

        try {

            // 본인이 작성한 신고 조회
            const report = db.prepare(`
                SELECT *
                FROM reports
                WHERE report_id = ?
                  AND author_id = ?
                  AND deleted_at IS NULL
            `).get(reportId, userId);

            if (!report) {
                throw new HttpError(
                    404,
                    'NOT_FOUND',
                    '본인의 신고를 찾을 수 없습니다.'
                );
            }

            if (!MATCHABLE_STATUSES.includes(report.status)) {
                throw new HttpError(
                    409,
                    'INVALID_STATUS',
                    '현재 상태에서는 매칭할 수 없습니다.'
                );
            }

            // 반대 유형의 신고 목록 조회
            const oppositeType =
                report.report_type === 'LOST'
                    ? 'FOUND'
                    : 'LOST';

            const candidates =
                listMatchableReports(db, oppositeType);

            let created = 0;
            let existing = 0;
            let eligible = 0;

            for (const candidate of candidates) {

                const lost =
                    report.report_type === 'LOST'
                        ? report
                        : candidate;

                const found =
                    report.report_type === 'FOUND'
                        ? report
                        : candidate;

                const result =
                    calculateSimilarity(lost, found);

                if (!result.isCandidate) {
                    continue;
                }

                eligible++;

                // 매칭 후보 DB 저장
                const inserted = insertCandidate(db, {
                    lostReportId: lost.report_id,
                    foundReportId: found.report_id,
                    similarity: result.similarity
                });

                if (!inserted) {
                    existing++;
                    continue;
                }

                created++;

                // A파트 알림 서비스 호출
                createNotification(db, {
                    userId: lost.author_id,
                    type: 'MATCH',
                    message: '등록한 분실물과 유사한 습득물이 발견되었습니다.',
                    targetPath:
                        `/features/discovery/frontend/matches.html?reportId=${lost.report_id}`
                });
            }

            db.exec('COMMIT');

            return {
                reportId,
                compared: candidates.length,
                eligible,
                created,
                existing
            };

        } catch (error) {

            db.exec('ROLLBACK');
            throw error;
        }

    } finally {
        db.close();
    }
}

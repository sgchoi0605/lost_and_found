
// [C] 검색·매칭·통계 기능의 API 라우터
import { Router } from 'express';

import {
    requireAuth
} from '../../../shared/backend/auth.middleware.js';

import {
    requireAdmin
} from '../../../shared/backend/admin.middleware.js';

import {
    getReports,
    getReport
} from './search.controller.js';

import {
    getMyMatchableReports,
    createMatches,
    getMatches
} from './matching.controller.js';

import {
    getAdminMatches,
    updateAdminMatch
} from './admin-matching.controller.js';

import {
    getAdminStatistics
} from './stats.controller.js';

const router = Router();

// 서버 연결 확인
router.get('/health', (_req, res) => {
    res.json({
        feature: 'discovery',
        status: 'ok',
        stage: 'routing-only'
    });
});

// 분실·습득 신고 검색 및 필터링
router.get('/reports', getReports);

// 개별 신고 상세 조회
router.get('/reports/:id', getReport);

// 본인의 매칭 가능한 신고 목록
router.get(
    '/matchable-reports',
    requireAuth,
    getMyMatchableReports
);

// 유사 물품 매칭 후보 생성
router.post(
    '/reports/:id/matches',
    requireAuth,
    createMatches
);

// 본인의 매칭 결과 조회
router.get(
    '/matches',
    requireAuth,
    getMatches
);

// 관리자 전체 매칭 목록 조회
router.get(
    '/admin/matches',
    requireAuth,
    requireAdmin,
    getAdminMatches
);

// 관리자 매칭 확정·거절·해제
router.post(
    '/admin/matches/:id/review',
    requireAuth,
    requireAdmin,
    updateAdminMatch
);

// 관리자 통계 조회
router.get(
    '/admin/stats',
    requireAuth,
    requireAdmin,
    getAdminStatistics
);

export default router;

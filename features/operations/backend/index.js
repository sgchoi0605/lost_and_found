// [D] 인계·보관·폐기 기능의 API 경로를 모아 공통 서버(/api/operations)에 연결합니다.

import { Router } from 'express';
import { requireAdmin } from '../../../shared/backend/admin.middleware.js';
import { requireAuth } from '../../../shared/backend/auth.middleware.js';
import * as handover from './handover.controller.js';
import * as storage from './storage.controller.js';

const router = Router();

// 서버와 인계·보관 기능의 준비 상태를 반환합니다.
router.get('/health', (_req, res) => {
  res.json({ feature: 'operations', status: 'ok', stage: 'operations-ready' });
});

// 일반 사용자 인계 신청 및 본인 현황 조회
router.post('/handovers', requireAuth, handover.create);
router.get('/handovers/mine', requireAuth, handover.listMine);

// 관리자 인계 신청 목록·상세·심사(검토 중/승인/거절)·실물 인계 완료
router.get('/admin/handovers', requireAuth, requireAdmin, handover.listAdmin);
router.get('/admin/handovers/:id', requireAuth, requireAdmin, handover.getAdminOne);
router.patch('/admin/handovers/:id/status', requireAuth, requireAdmin, handover.updateAdminStatus);
router.post('/admin/handovers/:id/complete', requireAuth, requireAdmin, handover.completeAdmin);

// 관리자 보관 접수·목록·미등록 습득물·보관 정보 수정·폐기/이관·기한 점검
router.get('/admin/storage', requireAuth, requireAdmin, storage.listAdmin);
router.get('/admin/storage/candidates', requireAuth, requireAdmin, storage.listCandidates);
router.post('/admin/storage', requireAuth, requireAdmin, storage.create);
router.post('/admin/storage/check-retention', requireAuth, requireAdmin, storage.checkRetention);
router.patch('/admin/storage/:id', requireAuth, requireAdmin, storage.updateAdmin);
router.post('/admin/storage/:id/dispose', requireAuth, requireAdmin, storage.disposeAdmin);

export default router;

// [B] 분실·습득 신고 API 경로를 모아 공통 서버(/api/reports)에 연결합니다.

import { Router } from 'express';
import { requireAdmin } from '../../../shared/backend/admin.middleware.js';
import { requireAuth, requireCanReport } from '../../../shared/backend/auth.middleware.js';
import {
  create,
  getOne,
  getPhoto,
  listAdmin,
  listMine,
  removeAdmin,
  removeMine,
  updateAdminStatus,
  updateMine,
} from './report.controller.js';

const router = Router();

// 공통 서버 테스트와의 호환을 위해 기존 health 응답 형식을 유지합니다.
router.get('/health', (_req, res) => {
  res.json({ feature: 'reports', status: 'ok', stage: 'routing-only' });
});

// 업로드된 신고 사진 파일 조회 (같은 출처 <img> 표시용)
router.get('/photos/:fileName', getPhoto);

// 신고 등록 (로그인 + 신고 제한 여부 검사)
router.post('/', requireAuth, requireCanReport, create);

// 본인 신고 목록 조회
router.get('/mine', requireAuth, listMine);

// 관리자 전체 신고 조회·상태 변경·삭제
router.get('/admin', requireAuth, requireAdmin, listAdmin);
router.patch('/admin/:id/status', requireAuth, requireAdmin, updateAdminStatus);
router.delete('/admin/:id', requireAuth, requireAdmin, removeAdmin);

// 본인 신고 단건 조회·수정·삭제 (정적 경로보다 아래에 등록)
router.get('/:id', requireAuth, getOne);
router.patch('/:id', requireAuth, updateMine);
router.delete('/:id', requireAuth, removeMine);

export default router;

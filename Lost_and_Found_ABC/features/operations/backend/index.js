// 인계·보관 기능의 API 경로를 모아 공통 서버에 연결할 라우터입니다.
import { Router } from 'express';

const router = Router();

// 서버와 라우터의 연결만 확인합니다. 실제 DB 연결이나 인증 성공을 뜻하지 않습니다.
router.get('/health', (_req, res) => {
  res.json({ feature: 'operations', status: 'ok', stage: 'routing-only' });
});

// 공통 서버가 /api/operations 경로에 등록할 수 있도록 내보냅니다.
export default router;

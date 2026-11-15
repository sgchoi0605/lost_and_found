// [A] 계정 API 주소와 처리 함수를 연결합니다. 검사는 왼쪽부터 차례대로 실행됩니다.

import { Router } from 'express';
import * as auth from './auth.controller.js';
import * as notification from './notification.controller.js';
import * as admin from './user-admin.controller.js';
import { requireAuth } from '../../../shared/backend/auth.middleware.js';
import { requireAdmin } from '../../../shared/backend/admin.middleware.js';
import { HttpError } from '../../../shared/backend/error.middleware.js';

export function createAccountRouter() {
  const router = Router();
  // 인증 시도 제한은 프로세스 단위입니다. 만료된 항목은 매 요청 정리합니다.
  const attempts = new Map();
  function limitAttempts(req, res, next) {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (entry.until <= now) {
        attempts.delete(key);
      }
    }
    const key = req.ip;
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= 10000) {
        throw new HttpError(429, 'RATE_LIMITED', '잠시 후 다시 시도해주세요.');
      }
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(key, entry);
    }
    if (++entry.count > 30) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      throw new HttpError(
        429,
        'RATE_LIMITED',
        '인증 요청이 너무 많습니다. 15분 후 다시 시도해주세요.',
      );
    }
    next();
  }
  // 공개 경로입니다. 가입·로그인은 먼저 IP별 요청 횟수를 제한합니다.
  router.get('/health', (_req, res) =>
    res.json({ feature: 'account', status: 'ok', stage: 'account-ready' }),
  );
  router.post('/signup', limitAttempts, auth.register);
  router.post('/login', limitAttempts, auth.signIn);
  // 이 아래 계정·알림 요청은 requireAuth로 로그인 여부를 먼저 확인합니다.
  router.get('/me', requireAuth, auth.me);
  router.post('/logout', requireAuth, auth.signOut);
  router.get('/notifications', requireAuth, notification.list);
  router.patch('/notifications/read-all', requireAuth, notification.readAll);
  router.patch('/notifications/:id/read', requireAuth, notification.read);
  // 관리자 API는 로그인 검사 다음에 관리자 권한까지 확인합니다.
  router.get('/admin/users', requireAuth, requireAdmin, admin.list);
  router.patch('/admin/users/:id/restriction', requireAuth, requireAdmin, admin.restrict);
  return router;
}
export default createAccountRouter();

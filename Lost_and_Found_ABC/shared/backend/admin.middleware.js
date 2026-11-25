// [A] 인증 후 실행하여 현재 사용자가 관리자인지 검사합니다.

import { HttpError } from './error.middleware.js';
export function requireAdmin(req, _res, next) {
  if (!req.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  }
  if (req.user.role !== 'ADMIN') {
    throw new HttpError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.');
  }
  next();
}

// [A] API 처리 전에 로그인 여부를 검사합니다. req는 요청, next()는 다음 처리로 이동하는 함수입니다.

import { hashToken } from '../../features/account/backend/auth.service.js';
import { publicColumns, publicUser } from '../../features/account/backend/auth.repository.js';
import { HttpError } from './error.middleware.js';

// 여러 쿠키 중 lf_session만 꺼내고 토큰 형식도 확인합니다.
export function sessionToken(req) {
  const token = (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('lf_session='))
    ?.slice(11);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

// server.js가 req.db를 연결합니다. 다른 기능에서도 재사용합니다.
export function requireAuth(req, _res, next) {
  const token = sessionToken(req);
  // 토큰 해시와 만료 시각을 검사한 뒤 users에서 현재 권한·제한을 다시 읽습니다.
  const session =
    token &&
    req.db
      .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(hashToken(token), new Date().toISOString());
  const user =
    session &&
    req.db.prepare(`SELECT ${publicColumns} FROM users WHERE user_id = ?`).get(session.user_id);
  if (!user) {
    throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  }
  // 이후 처리 함수가 인증된 사용자 정보를 req.user로 사용할 수 있게 합니다.
  req.user = publicUser(user);
  next();
}

// 신고 제한은 로그인 차단과 별개입니다. B가 신고 등록 API에 적용합니다.
export function requireCanReport(req, _res, next) {
  if (!req.user) {
    throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  }
  if (req.user.report_blocked) {
    throw new HttpError(403, 'REPORT_BLOCKED', '신고 등록이 제한된 계정입니다.');
  }
  next();
}

// [A] 로그인 관련 HTTP 요청을 받아 서비스에 넘기고, 결과와 쿠키를 응답합니다.

import { signup, login, hashToken, SESSION_SECONDS } from './auth.service.js';
import { sessionToken } from '../../../shared/backend/auth.middleware.js';
import { transaction, recordAudit } from '../../../shared/backend/audit.service.js';

// HttpOnly는 JS에서 쿠키를 읽지 못하게 합니다. HTTPS 배포에서는 Secure도 적용합니다.
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

// 요청 본문(req.body)을 검증·저장한 뒤 201(생성 완료)로 응답합니다.
export async function register(req, res) {
  res.status(201).json({ data: await signup(req.db, req.body) });
}

// 서비스가 만든 세션 토큰은 쿠키에만 넣고 사용자 정보만 JSON으로 보냅니다.
export async function signIn(req, res) {
  const result = await login(req.db, req.body, sessionToken(req));
  res.cookie('lf_session', result.token, {
    ...cookieOptions(),
    maxAge: SESSION_SECONDS * 1000,
  });
  res.json({ data: result.user });
}

// 앞서 인증 검사를 통과하며 req.user에 담긴 현재 사용자를 반환합니다.
export function me(req, res) {
  res.json({ data: req.user });
}

// 현재 세션과 쿠키를 지워 재사용을 막고 로그아웃 이력을 남깁니다.
export function signOut(req, res) {
  transaction(req.db, () => {
    req.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(sessionToken(req)));
    recordAudit(req.db, {
      actorId: req.user.user_id,
      targetType: 'USER',
      targetId: req.user.user_id,
      action: 'LOGOUT',
    });
  });
  res.clearCookie('lf_session', cookieOptions());
  res.json({ data: { loggedOut: true } });
}

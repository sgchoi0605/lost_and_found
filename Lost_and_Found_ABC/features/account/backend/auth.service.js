// [A] 회원가입·비밀번호 확인·로그인 세션 생성에 필요한 규칙을 처리합니다.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from '../../../shared/backend/error.middleware.js';
import { recordAudit, transaction } from '../../../shared/backend/audit.service.js';
import { findCredentials, findUser, publicUser } from './auth.repository.js';
import { loginId, email, text, invalid } from './account.validation.js';

// 콜백 방식의 해시 함수를 await로 기다릴 수 있게 바꿉니다.
const scrypt = promisify(scryptCallback);

// 세션은 로그인 시점부터 7일 동안 유효합니다. DB에는 토큰의 해시만 저장합니다.
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// 무작위 값(salt)을 섞어 같은 비밀번호도 서로 다른 해시로 저장합니다.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}

// 저장된 salt로 해시를 다시 계산해 비교합니다. 비밀번호 원문은 복원하지 않습니다.
async function verifyPassword(password, stored) {
  const [, salt, hash] = (stored || '').split(':');
  const valid = /^[a-f0-9]{32}$/.test(salt || '') && /^[a-f0-9]{128}$/.test(hash || '');
  // 계정이 없어도 해시 계산은 수행해 응답 시간 차이를 줄입니다.
  const actual = await scrypt(password, valid ? salt : '00000000000000000000000000000000', 64);
  return valid && timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

// 형식과 비밀번호 확인을 검사한 뒤 사용자와 가입 이력을 함께 저장합니다.
export async function signup(db, body = {}) {
  const id = loginId(body.loginId);
  const mail = email(body.email);
  const name = text(body.name, '이름', 1, 50);
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    invalid('비밀번호는 8~128자로 입력해주세요.');
  }
  if (body.password !== body.confirmPassword) {
    invalid('비밀번호 확인이 일치하지 않습니다.');
  }
  const passwordHash = await hashPassword(body.password);
  try {
    return transaction(db, () => {
      const result = db
        .prepare('INSERT INTO users (login_id, email, name, password_hash) VALUES (?, ?, ?, ?)')
        .run(id, mail, name, passwordHash);
      // 방금 생성된 행의 ID를 받아 가입 이력과 응답에 사용합니다.
      const userId = Number(result.lastInsertRowid);
      recordAudit(db, { actorId: userId, targetType: 'USER', targetId: userId, action: 'SIGNUP' });
      return publicUser(findUser(db, userId));
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: users.')) {
      throw new HttpError(409, 'ACCOUNT_EXISTS', '이미 사용 중인 아이디 또는 이메일입니다.');
    }
    throw error;
  }
}

// 자격 확인 후 무작위 세션을 만들고 쿠키로 보낼 토큰과 사용자 정보를 반환합니다.
export async function login(db, body = {}, previousToken) {
  const id = text(body.loginId, '아이디', 1, 30);
  if (typeof body.password !== 'string' || !body.password.length || body.password.length > 128) {
    invalid('비밀번호를 입력해주세요.');
  }
  const user = findCredentials(db, id);
  if (!(await verifyPassword(body.password, user?.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  transaction(db, () => {
    // 만료된 세션을 정리하고, 재로그인에 사용한 기존 세션은 새 세션으로 교체합니다.
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    if (previousToken) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(previousToken));
    }
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      hashToken(token),
      user.user_id,
      expiresAt,
    );
    recordAudit(db, {
      actorId: user.user_id,
      targetType: 'USER',
      targetId: user.user_id,
      action: 'LOGIN',
    });
  });
  return { token, user: publicUser(findUser(db, user.user_id)) };
}

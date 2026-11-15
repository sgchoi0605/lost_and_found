// [A] 사용자 SQL 조회와 응답용 데이터 정리를 담당합니다. SQL의 ?에 실제 값을 전달합니다.

// 일반 조회에는 비밀번호 해시를 포함하지 않습니다.
export const publicColumns =
  'user_id, login_id, email, name, role, report_blocked, blocked_until, created_at';
export function findUser(db, id) {
  return db.prepare(`SELECT ${publicColumns} FROM users WHERE user_id = ?`).get(id);
}

// 로그인 검증에서만 비밀번호 해시가 포함된 행을 읽습니다.
export function findCredentials(db, id) {
  return db.prepare('SELECT * FROM users WHERE login_id = ?').get(id);
}

// 해시는 빼고, 제한 종료일을 반영한 현재 신고 제한 여부를 계산합니다.
export function publicUser(user) {
  const { password_hash, ...safe } = user;
  return {
    ...safe,
    report_blocked:
      Boolean(safe.report_blocked) &&
      (!safe.blocked_until || safe.blocked_until > new Date().toISOString()),
  };
}

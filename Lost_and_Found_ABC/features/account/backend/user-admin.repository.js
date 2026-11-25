// [A] 아이디·이름·이메일로 사용자를 검색하고 비밀번호를 제외한 결과를 반환합니다.

import { publicColumns } from './auth.repository.js';

// 같은 검색 조건으로 목록과 총 인원수를 조회해 페이지 이동에 사용합니다.
export function searchUsers(db, q, { limit, offset }) {
  // instr는 검색어의 %와 _도 일반 문자로 취급합니다.
  const where =
    'WHERE instr(lower(login_id), lower(?)) > 0 OR instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0';
  return {
    items: db
      .prepare(`SELECT ${publicColumns} FROM users ${where} ORDER BY user_id DESC LIMIT ? OFFSET ?`)
      .all(q, q, q, limit, offset),
    total: db.prepare(`SELECT count(*) AS n FROM users ${where}`).get(q, q, q).n,
  };
}

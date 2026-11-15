// [A] 관리자 사용자 조회·제한 요청을 서비스에 전달합니다. 권한 검사는 라우터가 먼저 합니다.

import { users, setRestriction } from './user-admin.service.js';

// 검색어·페이지 정보를 전달해 사용자 목록을 응답합니다.
export function list(req, res) {
  res.json({ data: users(req.db, req.query) });
}

// 변경한 관리자, 대상 사용자, 제한 내용을 서비스로 보냅니다.
export function restrict(req, res) {
  res.json({ data: setRestriction(req.db, req.user, req.params.id, req.body) });
}

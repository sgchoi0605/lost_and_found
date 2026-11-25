// [A] 로그인한 사용자의 알림 요청을 처리하고 { data: 결과 } 형식으로 응답합니다.

import { notifications, markRead } from './notification.service.js';

// 클라이언트가 보낸 사용자 ID 대신 로그인한 사용자 ID로 조회합니다.
export function list(req, res) {
  res.json({ data: notifications(req.db, req.user.user_id, req.query) });
}

// URL의 알림 ID와 로그인 사용자를 함께 전달해 본인 알림만 읽음 처리합니다.
export function read(req, res) {
  res.json({ data: markRead(req.db, req.user.user_id, req.params.id) });
}

// 본인의 미읽음 알림만 갱신하고 변경한 개수를 응답합니다.
export function readAll(req, res) {
  const result = req.db
    .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(new Date().toISOString(), req.user.user_id);
  res.json({ data: { updated: result.changes } });
}

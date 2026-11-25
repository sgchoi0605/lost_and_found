// [A] 알림 SQL을 실행합니다. run은 저장, get은 한 행, all은 여러 행을 반환합니다.

// 알림 한 건을 저장하고 새 알림 ID를 반환합니다.
export function insertNotification(db, { userId, type, message, targetPath }) {
  return Number(
    db
      .prepare(
        'INSERT INTO notifications (user_id, type, message, target_path) VALUES (?, ?, ?, ?)',
      )
      .run(userId, type, message, targetPath).lastInsertRowid,
  );
}

// 받는 사람을 기준으로 최신 알림부터 필요한 페이지 분량만 조회합니다.
export function listNotifications(db, userId, { limit, offset }) {
  return db
    .prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT ? OFFSET ?',
    )
    .all(userId, limit, offset);
}

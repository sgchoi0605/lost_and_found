// [A] 알림 생성·조회·읽음 규칙을 처리합니다. 알림은 받는 사람만 조회·변경할 수 있습니다.

import { insertNotification, listNotifications } from './notification.repository.js';
import { positiveId, text, invalid, pagination } from './account.validation.js';
import { HttpError } from '../../../shared/backend/error.middleware.js';

// C/D의 업무 트랜잭션 안에서 호출합니다. 공개 알림 생성 API는 제공하지 않습니다.
export function createNotification(db, input) {
  const userId = positiveId(input.userId);
  if (!['MATCH', 'HANDOVER', 'EXPIRY'].includes(input.type)) {
    invalid('알림 종류가 올바르지 않습니다.');
  }
  const message = text(input.message, '알림 내용', 1, 1000);
  // 알림 링크는 서비스 안의 HTML 화면만 허용합니다. 외부 주소는 거부합니다.
  const targetPath = input.targetPath ?? null;
  if (
    targetPath !== null &&
    (typeof targetPath !== 'string' ||
      targetPath.length > 500 ||
      !/^\/(?:features\/(?:account|reports|discovery|operations)\/frontend\/|(?:account|reports|discovery|operations)\/)[a-z0-9-]+\.html(?:\?[a-zA-Z0-9_=&%.-]*)?$/.test(
        targetPath,
      ))
  ) {
    invalid('서비스 내부 화면 경로만 알림에 연결할 수 있습니다.');
  }
  if (!db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(userId)) {
    throw new HttpError(404, 'USER_NOT_FOUND', '사용자가 없습니다.');
  }
  return insertNotification(db, { userId, type: input.type, message, targetPath });
}

// 현재 페이지의 알림과 전체 개수·미읽음 개수를 함께 반환합니다.
export function notifications(db, userId, query) {
  const paging = pagination(query);
  const total = db
    .prepare('SELECT count(*) AS n FROM notifications WHERE user_id = ?')
    .get(userId).n;
  const unreadCount = db
    .prepare('SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(userId).n;
  return {
    items: listNotifications(db, userId, paging),
    total,
    unreadCount,
    page: paging.page,
    limit: paging.limit,
  };
}

// 이미 읽었다면 COALESCE로 최초 읽은 시각을 유지합니다.
export function markRead(db, userId, id) {
  const result = db
    .prepare(
      'UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE notification_id = ? AND user_id = ?',
    )
    .run(new Date().toISOString(), positiveId(id), userId);
  if (!result.changes) {
    throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
  }
  return db
    .prepare('SELECT * FROM notifications WHERE notification_id = ? AND user_id = ?')
    .get(Number(id), userId);
}

// [A] 사용자 검색과 신고 제한 규칙을 처리합니다. 제한 사유는 이력으로 남깁니다.

import { publicUser, findUser } from './auth.repository.js';
import { searchUsers } from './user-admin.repository.js';
import { pagination, positiveId, text, invalid } from './account.validation.js';
import { HttpError } from '../../../shared/backend/error.middleware.js';
import { transaction, recordAudit } from '../../../shared/backend/audit.service.js';

// 검색어와 페이지를 검증하고 안전하게 공개할 사용자 정보만 반환합니다.
export function users(db, query) {
  const paging = pagination(query);
  const q = query.q === undefined ? '' : text(query.q, '검색어', 0, 100);
  const result = searchUsers(db, q, paging);
  return { ...result, items: result.items.map(publicUser), page: paging.page, limit: paging.limit };
}

// 제한 여부·사유·종료일을 확인합니다. 종료일이 없으면 무기한입니다.
export function setRestriction(db, actor, id, body = {}) {
  id = positiveId(id);
  if (typeof body.blocked !== 'boolean') {
    invalid('blocked는 true 또는 false여야 합니다.');
  }
  const reason = text(body.reason, '변경 사유', 1, 500);
  let until = null;
  if (body.blocked && body.until != null && body.until !== '') {
    if (
      typeof body.until !== 'string' ||
      !Number.isFinite(Date.parse(body.until)) ||
      Date.parse(body.until) <= Date.now()
    ) {
      invalid('제한 종료일은 미래 시각이어야 합니다.');
    }
    until = new Date(body.until).toISOString();
  }
  // 사용자 상태 변경과 이력 저장 중 하나라도 실패하면 둘 다 취소합니다.
  return transaction(db, () => {
    const user = findUser(db, id);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', '사용자가 없습니다.');
    }
    if (user.role === 'ADMIN') {
      throw new HttpError(
        403,
        'ADMIN_RESTRICTION_DENIED',
        '관리자 계정은 신고 제한 대상이 아닙니다.',
      );
    }
    db.prepare('UPDATE users SET report_blocked = ?, blocked_until = ? WHERE user_id = ?').run(
      body.blocked ? 1 : 0,
      until,
      id,
    );
    recordAudit(db, {
      actorId: actor.user_id,
      targetType: 'USER',
      targetId: id,
      action: body.blocked ? 'REPORT_BLOCK' : 'REPORT_UNBLOCK',
      detail: { reason, until },
    });
    return publicUser(findUser(db, id));
  });
}

// [A] 변경 이력을 기록하고, 함께 성공하거나 함께 취소해야 하는 DB 작업을 묶습니다.

// 업무와 동일한 DB 연결·트랜잭션에서 호출합니다. 비밀번호·토큰은 기록하지 않습니다.
export function recordAudit(db, { actorId = null, targetType, targetId, action, detail = null }) {
  db.prepare(
    'INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json) VALUES (?, ?, ?, ?, ?)',
  ).run(actorId, targetType, targetId, action, detail === null ? null : JSON.stringify(detail));
}

// work의 동기 DB 작업을 실행합니다. 성공은 COMMIT, 오류는 ROLLBACK으로 취소합니다.
export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

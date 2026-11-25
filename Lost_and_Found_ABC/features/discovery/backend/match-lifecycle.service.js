// [C] B는 이 서비스로 후보를 무효화하며 matches 테이블을 직접 수정하지 않습니다.
import { recordAudit } from '../../../shared/backend/audit.service.js';

// 호출자의 신고 변경 트랜잭션 안에서 실행합니다. 관리자 거절 이력은 유지합니다.
export function invalidateReportCandidates(db, reportId, actorId) {
  const candidates = db.prepare(`SELECT * FROM matches WHERE status = 'CANDIDATE'
    AND (lost_report_id = ? OR found_report_id = ?)`).all(reportId, reportId);
  for (const match of candidates) {
    recordAudit(db, { actorId, targetType: 'MATCH', targetId: match.match_id,
      action: 'MATCH_INVALIDATE', detail: { reportId, previous: match } });
    db.prepare('DELETE FROM matches WHERE match_id = ?').run(match.match_id);
  }
}

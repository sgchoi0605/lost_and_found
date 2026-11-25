// [ABC] 신고·매칭·인계가 서로 모순되지 않도록 쓰기 작업 전에 검사합니다.
import { HttpError } from './error.middleware.js';

export function assertReportMutable(db, report) {
  const id = report.report_id;
  const confirmed = db.prepare(`SELECT 1 FROM matches WHERE status = 'CONFIRMED'
    AND (lost_report_id = ? OR found_report_id = ?)`).get(id, id);
  const handover = db.prepare(`SELECT 1 FROM handover_requests WHERE status <> 'REJECTED'
    AND (lost_report_id = ? OR found_report_id = ?)`).get(id, id);
  const storage = db.prepare('SELECT 1 FROM storage_records WHERE found_report_id = ?').get(id);
  if (!['REPORTED', 'RECEIVED', 'STORED'].includes(report.status) || confirmed || handover || storage) {
    throw new HttpError(409, 'REPORT_LOCKED', '매칭·인계·보관 처리에 연결된 신고입니다. 담당 관리 절차에서 먼저 해제해주세요.');
  }
}

export function assertBasicTransition(report, nextStatus) {
  const allowed = report.status === 'REPORTED' ? ['RECEIVED']
    : report.status === 'RECEIVED' && report.report_type === 'FOUND' ? ['STORED'] : [];
  if (!allowed.includes(nextStatus)) {
    throw new HttpError(409, 'INVALID_REPORT_TRANSITION', '신고 관리에서는 접수, 습득물 보관 순서로만 변경할 수 있습니다.');
  }
}

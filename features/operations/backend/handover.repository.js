// [D] 인계 신청 데이터의 SQLite 조회·저장·수정을 처리합니다.

// 인계 신청 단건과 습득물·분실물·신청자·보관 정보를 함께 조회합니다.
export function findHandoverById(db, requestId) {
  return (
    db
      .prepare(
        `SELECT
           h.request_id,
           h.found_report_id,
           h.requester_id,
           h.lost_report_id,
           h.ownership_proof,
           h.status,
           h.reviewer_id,
           h.review_note,
           h.reviewed_at,
           h.recipient_name,
           h.completed_at,
           h.created_at,
           h.updated_at,
           u.name AS requester_name,
           u.login_id AS requester_login_id,
           u.email AS requester_email,
           rev.name AS reviewer_name,
           f.author_id AS found_author_id,
           f.item_name AS found_item_name,
           f.category AS found_category,
           f.place AS found_place,
           f.occurred_at AS found_occurred_at,
           f.storage_place AS found_storage_place,
           f.status AS found_status,
           l.item_name AS lost_item_name,
           l.status AS lost_status,
           s.storage_id,
           s.storage_place AS record_storage_place,
           s.stored_at,
           s.storage_deadline,
           s.status AS storage_status
         FROM handover_requests h
         JOIN users u ON u.user_id = h.requester_id
         JOIN reports f ON f.report_id = h.found_report_id
         LEFT JOIN users rev ON rev.user_id = h.reviewer_id
         LEFT JOIN reports l ON l.report_id = h.lost_report_id
         LEFT JOIN storage_records s ON s.found_report_id = h.found_report_id
         WHERE h.request_id = ?`,
      )
      .get(requestId) || null
  );
}

// 습득 신고에 거절 외의 진행·완료 인계 신청이 있는지 조회합니다.
export function findActiveHandoverByFoundReport(db, foundReportId) {
  return (
    db
      .prepare(
        `SELECT request_id, status
         FROM handover_requests
         WHERE found_report_id = ? AND status <> 'REJECTED'
         LIMIT 1`,
      )
      .get(foundReportId) || null
  );
}

// 분실 신고에 거절 외의 진행·완료 인계 신청이 있는지 조회합니다.
export function findActiveHandoverByLostReport(db, lostReportId) {
  return (
    db
      .prepare(
        `SELECT request_id, status
         FROM handover_requests
         WHERE lost_report_id = ? AND status <> 'REJECTED'
         LIMIT 1`,
      )
      .get(lostReportId) || null
  );
}

// 새 인계 신청을 등록하고 생성된 request_id를 반환합니다.
export function insertHandover(db, { foundReportId, requesterId, lostReportId, ownershipProof }) {
  const result = db
    .prepare(
      `INSERT INTO handover_requests (
         found_report_id, requester_id, lost_report_id, ownership_proof, status
       ) VALUES (?, ?, ?, ?, 'REQUESTED')`,
    )
    .run(foundReportId, requesterId, lostReportId ?? null, ownershipProof);
  return Number(result.lastInsertRowid);
}

// 인계 심사 상태와 검토 메모를 갱신합니다.
export function updateHandoverReview(
  db,
  requestId,
  { status, reviewerId, reviewNote, reviewedAt, updatedAt },
) {
  return db
    .prepare(
      `UPDATE handover_requests
       SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ?, updated_at = ?
       WHERE request_id = ?`,
    )
    .run(status, reviewerId, reviewNote, reviewedAt, updatedAt, requestId);
}

// 실물 인계 완료 정보(수령인·완료 시각)를 기록합니다.
export function updateHandoverComplete(
  db,
  requestId,
  { reviewerId, recipientName, completedAt, updatedAt },
) {
  return db
    .prepare(
      `UPDATE handover_requests
       SET status = 'COMPLETED', reviewer_id = ?, recipient_name = ?, completed_at = ?, updated_at = ?
       WHERE request_id = ?`,
    )
    .run(reviewerId, recipientName, completedAt, updatedAt, requestId);
}

// 로그인 사용자의 본인 인계 신청 목록을 최신순으로 조회합니다.
export function listHandoversByRequester(db, requesterId, { status, limit, offset }) {
  const conditions = ['h.requester_id = ?'];
  const params = [requesterId];
  if (status) {
    conditions.push('h.status = ?');
    params.push(status);
  }
  const where = conditions.join(' AND ');
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM handover_requests h WHERE ${where}`)
    .get(...params);

  const items = db
    .prepare(
      `SELECT
         h.request_id,
         h.found_report_id,
         h.requester_id,
         h.lost_report_id,
         h.ownership_proof,
         h.status,
         h.review_note,
         h.reviewed_at,
         h.recipient_name,
         h.completed_at,
         h.created_at,
         h.updated_at,
         f.item_name AS found_item_name,
         f.category AS found_category,
         f.place AS found_place,
         f.occurred_at AS found_occurred_at,
         f.storage_place AS found_storage_place,
         f.status AS found_status,
         s.storage_id,
         s.storage_place AS record_storage_place,
         s.storage_deadline,
         s.status AS storage_status
       FROM handover_requests h
       JOIN reports f ON f.report_id = h.found_report_id
       LEFT JOIN storage_records s ON s.found_report_id = h.found_report_id
       WHERE ${where}
       ORDER BY h.request_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { items, total };
}

// 관리자용 전체 인계 신청 목록과 상태별 집계를 조회합니다.
export function listAdminHandovers(db, { status, q = '', limit, offset }) {
  const conditions = ['1 = 1'];
  const params = [];
  if (status) {
    conditions.push('h.status = ?');
    params.push(status);
  }
  if (q) {
    conditions.push(
      '(instr(lower(f.item_name), lower(?)) > 0 OR instr(lower(u.name), lower(?)) > 0 OR instr(lower(u.login_id), lower(?)) > 0)',
    );
    params.push(q, q, q);
  }
  const where = conditions.join(' AND ');
  const { total } = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM handover_requests h
       JOIN reports f ON f.report_id = h.found_report_id
       JOIN users u ON u.user_id = h.requester_id
       WHERE ${where}`,
    )
    .get(...params);

  const items = db
    .prepare(
      `SELECT
         h.request_id,
         h.found_report_id,
         h.requester_id,
         h.lost_report_id,
         h.status,
         h.review_note,
         h.reviewed_at,
         h.recipient_name,
         h.completed_at,
         h.created_at,
         h.updated_at,
         u.name AS requester_name,
         u.login_id AS requester_login_id,
         f.item_name AS found_item_name,
         f.category AS found_category,
         f.place AS found_place,
         f.occurred_at AS found_occurred_at,
         f.storage_place AS found_storage_place,
         f.status AS found_status,
         s.storage_id,
         s.storage_place AS record_storage_place,
         s.storage_deadline,
         s.status AS storage_status
       FROM handover_requests h
       JOIN reports f ON f.report_id = h.found_report_id
       JOIN users u ON u.user_id = h.requester_id
       LEFT JOIN storage_records s ON s.found_report_id = h.found_report_id
       WHERE ${where}
       ORDER BY h.request_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status = 'REQUESTED' THEN 1 END) AS requested,
         COUNT(CASE WHEN status = 'UNDER_REVIEW' THEN 1 END) AS underReview,
         COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) AS approved,
         COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) AS rejected,
         COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS completed
       FROM handover_requests`,
    )
    .get();

  return { items, total, summary };
}

// 신청 생성 감사 이력에서 인계 신청 직전의 신고 상태를 조회합니다.
export function findPreviousReportStatuses(db, requestId) {
  const row = db
    .prepare(
      `SELECT detail_json
       FROM audit_logs
       WHERE target_type = 'HANDOVER'
         AND target_id = ?
         AND action = 'HANDOVER_CREATE'
       ORDER BY log_id DESC
       LIMIT 1`,
    )
    .get(requestId);
  if (!row?.detail_json) {
    return null;
  }
  try {
    return JSON.parse(row.detail_json);
  } catch {
    return null;
  }
}

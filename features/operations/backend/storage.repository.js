// [D] 물품 보관 기록의 SQLite 조회·저장·수정을 처리합니다.

// 보관 ID로 보관 기록과 연결된 습득 신고 정보를 함께 조회합니다.
export function findStorageById(db, storageId) {
  return (
    db
      .prepare(
        `SELECT
           s.storage_id,
           s.found_report_id,
           s.storage_place,
           s.stored_at,
           s.storage_deadline,
           s.status,
           s.disposition_note,
           s.disposed_at,
           s.created_at,
           s.updated_at,
           r.item_name,
           r.category,
           r.place,
           r.occurred_at,
           r.storage_place AS reported_storage_place,
           r.status AS report_status
         FROM storage_records s
         JOIN reports r ON r.report_id = s.found_report_id
         WHERE s.storage_id = ?`,
      )
      .get(storageId) || null
  );
}

// 습득 신고 ID로 현재 보관 기록을 조회합니다.
export function findStorageByFoundReportId(db, foundReportId) {
  return (
    db
      .prepare('SELECT * FROM storage_records WHERE found_report_id = ?')
      .get(foundReportId) || null
  );
}

// 새 보관 기록을 등록하고 생성된 storage_id를 반환합니다.
export function insertStorageRecord(
  db,
  { foundReportId, storagePlace, storedAt, storageDeadline },
) {
  const result = db
    .prepare(
      `INSERT INTO storage_records (
         found_report_id, storage_place, stored_at, storage_deadline, status
       ) VALUES (?, ?, ?, ?, 'STORED')`,
    )
    .run(foundReportId, storagePlace, storedAt, storageDeadline);
  return Number(result.lastInsertRowid);
}

// 보관 중인 물품의 보관 장소와 보관 기한을 수정합니다.
export function updateStorageRecord(db, storageId, { storagePlace, storageDeadline, updatedAt }) {
  return db
    .prepare(
      `UPDATE storage_records
       SET storage_place = ?, storage_deadline = ?, updated_at = ?
       WHERE storage_id = ?`,
    )
    .run(storagePlace, storageDeadline, updatedAt, storageId);
}

// 보관 물품을 폐기(DISPOSED) 또는 이관(TRANSFERRED)으로 종료 처리합니다.
export function disposeStorageRecord(
  db,
  storageId,
  { status, dispositionNote, disposedAt, updatedAt },
) {
  return db
    .prepare(
      `UPDATE storage_records
       SET status = ?, disposition_note = ?, disposed_at = ?, updated_at = ?
       WHERE storage_id = ?`,
    )
    .run(status, dispositionNote, disposedAt, updatedAt, storageId);
}

// 관리자용 보관 물품 목록과 상태·기한별 집계를 조회합니다.
export function listStorageRecords(
  db,
  { status, retention, q = '', nowIso, warningCutoffIso, limit, offset },
) {
  const conditions = ['r.deleted_at IS NULL'];
  const params = [];

  if (status) {
    conditions.push('s.status = ?');
    params.push(status);
  }
  if (retention === 'EXPIRED') {
    conditions.push("s.status = 'STORED' AND s.storage_deadline <= ?");
    params.push(nowIso);
  } else if (retention === 'EXPIRING_SOON') {
    conditions.push("s.status = 'STORED' AND s.storage_deadline > ? AND s.storage_deadline <= ?");
    params.push(nowIso, warningCutoffIso);
  } else if (retention === 'NORMAL') {
    conditions.push("s.status = 'STORED' AND s.storage_deadline > ?");
    params.push(warningCutoffIso);
  }
  if (q) {
    conditions.push(
      '(instr(lower(r.item_name), lower(?)) > 0 OR instr(lower(s.storage_place), lower(?)) > 0)',
    );
    params.push(q, q);
  }

  const where = conditions.join(' AND ');
  const { total } = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM storage_records s
       JOIN reports r ON r.report_id = s.found_report_id
       WHERE ${where}`,
    )
    .get(...params);

  const items = db
    .prepare(
      `SELECT
         s.storage_id,
         s.found_report_id,
         s.storage_place,
         s.stored_at,
         s.storage_deadline,
         s.status,
         s.disposition_note,
         s.disposed_at,
         s.created_at,
         s.updated_at,
         r.item_name,
         r.category,
         r.place,
         r.occurred_at,
         r.storage_place AS reported_storage_place,
         r.status AS report_status
       FROM storage_records s
       JOIN reports r ON r.report_id = s.found_report_id
       WHERE ${where}
       ORDER BY
         CASE WHEN s.status = 'STORED' THEN 0 ELSE 1 END ASC,
         s.storage_deadline ASC,
         s.storage_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  const summary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN s.status = 'STORED' THEN 1 END) AS stored,
         COUNT(CASE WHEN s.status = 'HANDED_OVER' THEN 1 END) AS handedOver,
         COUNT(CASE WHEN s.status = 'DISPOSED' THEN 1 END) AS disposed,
         COUNT(CASE WHEN s.status = 'TRANSFERRED' THEN 1 END) AS transferred,
         COUNT(CASE WHEN s.status = 'STORED' AND s.storage_deadline <= ? THEN 1 END) AS expired,
         COUNT(CASE WHEN s.status = 'STORED' AND s.storage_deadline > ? AND s.storage_deadline <= ? THEN 1 END) AS expiringSoon
       FROM storage_records s
       JOIN reports r ON r.report_id = s.found_report_id
       WHERE r.deleted_at IS NULL`,
    )
    .get(nowIso, nowIso, warningCutoffIso);

  return { items, total, summary };
}

// 아직 보관 기록이 없는 습득 신고 목록을 조회합니다.
export function listStorageCandidates(db, { q = '', limit, offset }) {
  const conditions = [
    "r.report_type = 'FOUND'",
    'r.deleted_at IS NULL',
    "r.status IN ('REPORTED', 'RECEIVED', 'STORED', 'MATCHED', 'HANDOVER_IN_PROGRESS')",
    'NOT EXISTS (SELECT 1 FROM storage_records s WHERE s.found_report_id = r.report_id)',
  ];
  const params = [];
  if (q) {
    conditions.push('(instr(lower(r.item_name), lower(?)) > 0 OR instr(lower(r.place), lower(?)) > 0)');
    params.push(q, q);
  }
  const where = conditions.join(' AND ');
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM reports r WHERE ${where}`)
    .get(...params);

  const items = db
    .prepare(
      `SELECT
         r.report_id,
         r.item_name,
         r.category,
         r.place,
         r.occurred_at,
         r.storage_place,
         r.status,
         r.created_at
       FROM reports r
       WHERE ${where}
       ORDER BY r.report_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { items, total };
}

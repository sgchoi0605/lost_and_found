// [B] 분실·습득 신고와 사진 데이터의 SQLite 조회·저장·수정을 처리합니다.

// 특정 신고에 연결된 사진 목록을 표시 순서대로 조회합니다.
export function findPhotosByReportId(db, reportId) {
  return db
    .prepare(
      `SELECT photo_id, photo_url, sort_order, created_at
       FROM report_photos
       WHERE report_id = ?
       ORDER BY sort_order ASC, photo_id ASC`,
    )
    .all(reportId);
}

// 삭제되지 않은 신고 단건과 작성자 기본 정보·사진 목록을 함께 조회합니다.
export function findReportById(db, reportId) {
  const report = db
    .prepare(
      `SELECT
         r.report_id,
         r.author_id,
         r.report_type,
         r.item_name,
         r.category,
         r.place,
         r.occurred_at,
         r.description,
         r.storage_place,
         r.status,
         r.created_at,
         r.updated_at,
         u.name AS author_name,
         u.login_id AS author_login_id
       FROM reports r
       JOIN users u ON u.user_id = r.author_id
       WHERE r.report_id = ? AND r.deleted_at IS NULL`,
    )
    .get(reportId);

  if (!report) {
    return null;
  }
  return { ...report, photos: findPhotosByReportId(db, report.report_id) };
}

// 새 신고를 등록하고 생성된 report_id를 반환합니다.
export function insertReport(
  db,
  { authorId, reportType, itemName, category, place, occurredAt, description, storagePlace },
) {
  const result = db
    .prepare(
      `INSERT INTO reports (
         author_id, report_type, item_name, category, place, occurred_at, description, storage_place, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REPORTED')`,
    )
    .run(authorId, reportType, itemName, category, place, occurredAt, description, storagePlace);

  return Number(result.lastInsertRowid);
}

// 신고에 연결된 사진 URL 목록을 순서대로 저장합니다.
export function insertReportPhotos(db, reportId, photoUrls) {
  if (photoUrls.length === 0) {
    return;
  }
  const statement = db.prepare(
    'INSERT INTO report_photos (report_id, photo_url, sort_order) VALUES (?, ?, ?)',
  );
  photoUrls.forEach((photoUrl, index) => {
    statement.run(reportId, photoUrl, index);
  });
}

// 로그인 사용자가 작성한 삭제되지 않은 신고 목록을 최신순으로 조회합니다.
export function listReportsByAuthor(db, authorId, { limit, offset }) {
  const { total } = db
    .prepare(
      'SELECT COUNT(*) AS total FROM reports WHERE author_id = ? AND deleted_at IS NULL',
    )
    .get(authorId);

  const items = db
    .prepare(
      `SELECT
         r.report_id,
         r.author_id,
         r.report_type,
         r.item_name,
         r.category,
         r.place,
         r.occurred_at,
         r.description,
         r.storage_place,
         r.status,
         r.created_at,
         r.updated_at,
         (
           SELECT p.photo_url
           FROM report_photos p
           WHERE p.report_id = r.report_id
           ORDER BY p.sort_order ASC, p.photo_id ASC
           LIMIT 1
         ) AS photo_url
       FROM reports r
       WHERE r.author_id = ? AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC, r.report_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(authorId, limit, offset);

  return { items, total };
}

// 관리자용 전체 신고 목록을 상태·유형 조건으로 조회합니다.
export function listAdminReports(db, { status, reportType, q = '', limit, offset }) {
  const conditions = ['r.deleted_at IS NULL'];
  const params = [];

  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  if (reportType) {
    conditions.push('r.report_type = ?');
    params.push(reportType);
  }

  if (q) {
    conditions.push('(instr(lower(r.item_name), lower(?)) > 0 OR instr(lower(r.description), lower(?)) > 0)');
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
         r.author_id,
         r.report_type,
         r.item_name,
         r.category,
         r.place,
         r.occurred_at,
         r.description,
         r.storage_place,
         r.status,
         r.created_at,
         r.updated_at,
         u.name AS author_name,
         u.login_id AS author_login_id,
         (
           SELECT p.photo_url
           FROM report_photos p
           WHERE p.report_id = r.report_id
           ORDER BY p.sort_order ASC, p.photo_id ASC
           LIMIT 1
         ) AS photo_url
       FROM reports r
       JOIN users u ON u.user_id = r.author_id
       WHERE ${where}
       ORDER BY r.created_at DESC, r.report_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);

  return { items, total };
}

// 신고의 수정 가능 항목을 갱신합니다. report_type은 스키마 정책상 변경하지 않습니다.
export function updateReport(
  db,
  reportId,
  { itemName, category, place, occurredAt, description, storagePlace, updatedAt },
) {
  return db
    .prepare(
      `UPDATE reports
       SET item_name = ?, category = ?, place = ?, occurred_at = ?, description = ?, storage_place = ?, updated_at = ?
       WHERE report_id = ? AND deleted_at IS NULL`,
    )
    .run(itemName, category, place, occurredAt, description, storagePlace, updatedAt, reportId);
}

// 관리자가 신고 진행 상태를 변경합니다.
export function updateReportStatus(db, reportId, status, updatedAt) {
  return db
    .prepare(
      'UPDATE reports SET status = ?, updated_at = ? WHERE report_id = ? AND deleted_at IS NULL',
    )
    .run(status, updatedAt, reportId);
}

// 외래 키 무결성을 지키기 위해 물리 삭제 대신 deleted_at을 기록해 논리 삭제합니다.
export function softDeleteReport(db, reportId, deletedAt) {
  return db
    .prepare(
      'UPDATE reports SET deleted_at = ?, updated_at = ? WHERE report_id = ? AND deleted_at IS NULL',
    )
    .run(deletedAt, deletedAt, reportId);
}

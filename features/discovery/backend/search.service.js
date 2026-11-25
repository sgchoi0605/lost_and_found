


const REPORT_TYPES = ['LOST', 'FOUND'];

const REPORT_STATUSES = [
  'REPORTED',
  'RECEIVED',
  'STORED',
  'MATCHED',
  'HANDOVER_IN_PROGRESS',
  'HANDED_OVER',
  'DISPOSED',
  'TRANSFERRED'
];

// 검색 조건 검증 오류
function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'VALIDATION_ERROR';
  throw error;
}

// 문자열 검색 조건 검증
function readText(value) {
  if (value === undefined) return '';

  if (typeof value !== 'string') {
    validationError('잘못된 검색 조건입니다.');
  }

  return value.trim();
}

// 날짜 형식 검증
function readDate(value) {
  const text = readText(value);

  if (!text) return '';

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(Date.parse(text)) ||
    new Date(text).toISOString().slice(0, 10) !== text
  ) {
    validationError('날짜 형식이 올바르지 않습니다.');
  }

  return text;
}

// 분실물·습득물 검색 및 필터링
export function searchReports(db, query = {}) {
  const q = readText(query.q);
  const reportType = readText(query.reportType);
  const category = readText(query.category);
  const place = readText(query.place);
  const status = readText(query.status);
  const startDate = readDate(query.startDate);
  const endDate = readDate(query.endDate);

  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger((page - 1) * limit)
  ) {
    validationError('페이지 또는 조회 개수가 올바르지 않습니다.');
  }

  if (reportType && !REPORT_TYPES.includes(reportType)) {
    validationError('잘못된 신고 유형입니다.');
  }

  if (status && !REPORT_STATUSES.includes(status)) {
    validationError('잘못된 신고 상태입니다.');
  }

  if (startDate && endDate && startDate > endDate) {
    validationError('시작 날짜는 종료 날짜보다 늦을 수 없습니다.');
  }

  const conditions = ['r.deleted_at IS NULL'];
  const params = [];

  if (q) {
    conditions.push('instr(lower(r.item_name), lower(?)) > 0');
    params.push(q);
  }

  if (reportType) {
    conditions.push('r.report_type = ?');
    params.push(reportType);
  }

  if (category) {
    conditions.push('r.category = ?');
    params.push(category);
  }

  if (place) {
    conditions.push('instr(lower(r.place), lower(?)) > 0');
    params.push(place);
  }

  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }

  if (startDate) {
    conditions.push('date(r.occurred_at) >= ?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('date(r.occurred_at) <= ?');
    params.push(endDate);
  }

  const where = conditions.join(' AND ');
  {
    const { total } = db.prepare(`
      SELECT COUNT(*) AS total
      FROM reports r
      WHERE ${where}
    `).get(...params);

    const items = db.prepare(`
      SELECT
        r.report_id,
        r.report_type,
        r.item_name,
        r.category,
        r.place,
        r.occurred_at,
        r.status,
        r.created_at,
        (
          SELECT p.photo_url
          FROM report_photos p
          WHERE p.report_id = r.report_id
          ORDER BY p.sort_order, p.photo_id
          LIMIT 1
        ) AS photo_url
      FROM reports r
      WHERE ${where}
      ORDER BY r.created_at DESC, r.report_id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit);

    return {
      items,
      total,
      page,
      limit
    };
  }
}

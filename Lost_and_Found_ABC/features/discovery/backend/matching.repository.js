
// [C] 유사 물품 매칭 데이터의 DB 조회·저장·수정

// 매칭 가능한 신고 조회
export function listMatchableReports(db, reportType) {
    return db.prepare(`
        SELECT
            report_id,
            author_id,
            report_type,
            item_name,
            category,
            place,
            occurred_at,
            status
        FROM reports
        WHERE report_type = ?
          AND deleted_at IS NULL
          AND status IN (
              'REPORTED',
              'RECEIVED',
              'STORED'
          )
        ORDER BY report_id
    `).all(reportType);
}

// 기존 매칭 결과 조회
export function findMatchByPair(
    db,
    lostReportId,
    foundReportId
) {
    return db.prepare(`
        SELECT *
        FROM matches
        WHERE lost_report_id = ?
          AND found_report_id = ?
    `).get(lostReportId, foundReportId);
}

// 새로운 매칭 후보 저장
export function insertCandidate(db, {
    lostReportId,
    foundReportId,
    similarity
}) {
    const result = db.prepare(`
        INSERT INTO matches (
            lost_report_id,
            found_report_id,
            source,
            similarity,
            status
        )
        VALUES (?, ?, 'AUTO', ?, 'CANDIDATE')
        ON CONFLICT (
            lost_report_id,
            found_report_id
        ) DO NOTHING
    `).run(
        lostReportId,
        foundReportId,
        similarity
    );

    return result.changes > 0;
}

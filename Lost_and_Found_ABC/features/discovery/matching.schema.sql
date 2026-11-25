
-- [A 설계 / C 기능] 분실 신고와 습득 신고의 후보 연결입니다. 매칭 알고리즘은 아직 구현하지 않습니다.
CREATE TABLE IF NOT EXISTS matches (
  match_id INTEGER PRIMARY KEY,
  lost_report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE RESTRICT,
  found_report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'ADMIN')),
  similarity REAL CHECK (similarity IS NULL OR similarity BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE', 'CONFIRMED', 'REJECTED')),
  reviewed_by INTEGER REFERENCES users(user_id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (lost_report_id, found_report_id),
  CHECK (lost_report_id <> found_report_id)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_matches_found ON matches(found_report_id, status);

-- 외래 키는 신고의 존재만 검사하므로 분실/습득 유형도 등록·수정 시 검사합니다.
CREATE TRIGGER IF NOT EXISTS validate_match_insert
BEFORE INSERT ON matches
WHEN NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.lost_report_id AND report_type = 'LOST')
  OR NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.found_report_id AND report_type = 'FOUND')
BEGIN
  SELECT RAISE(ABORT, 'matches require LOST and FOUND reports');
END;
CREATE TRIGGER IF NOT EXISTS validate_match_update
BEFORE UPDATE OF lost_report_id, found_report_id ON matches
WHEN NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.lost_report_id AND report_type = 'LOST')
  OR NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.found_report_id AND report_type = 'FOUND')
BEGIN
  SELECT RAISE(ABORT, 'matches require LOST and FOUND reports');
END;


-- [A 설계 / B 기능] ERD의 공통 신고 정보를 저장합니다. 보관 정보는 D의 storage_records로 분리합니다.
-- 날짜는 UTC ISO 8601 문자열을 사용하고, 수정 시 updated_at은 서비스가 함께 갱신합니다.
CREATE TABLE IF NOT EXISTS reports (
  report_id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL CHECK (report_type IN ('LOST', 'FOUND')),
  item_name TEXT NOT NULL CHECK (length(trim(item_name)) > 0),
  category TEXT NOT NULL CHECK (length(trim(category)) > 0),
  place TEXT NOT NULL CHECK (length(trim(place)) > 0),
  occurred_at TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN (
    'REPORTED', 'RECEIVED', 'STORED', 'MATCHED', 'HANDOVER_IN_PROGRESS', 'HANDED_OVER', 'DISPOSED', 'TRANSFERRED'
  )),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_reports_author ON reports(author_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_search ON reports(report_type, status, category, occurred_at) WHERE deleted_at IS NULL;

-- ERD의 photo_urls 배열 대신 역할분담 문서의 사진 테이블로 일대다 관계를 만듭니다.
-- 실제 파일 업로드가 아닌 사진 경로와 표시 순서의 저장 구조만 제공합니다.
CREATE TABLE IF NOT EXISTS report_photos (
  photo_id INTEGER PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE RESTRICT,
  photo_url TEXT NOT NULL CHECK (length(trim(photo_url)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (report_id, sort_order)
) STRICT;

-- 매칭·인계·보관 관계가 반대 유형으로 바뀌지 않도록 등록 후 분실/습득 유형 변경을 막습니다.
CREATE TRIGGER IF NOT EXISTS prevent_report_type_change
BEFORE UPDATE OF report_type ON reports WHEN NEW.report_type <> OLD.report_type
BEGIN
  SELECT RAISE(ABORT, 'report_type cannot be changed');
END;


-- [A 설계 / D 기능] 인계 신청의 심사 상태와 실제 전달 기록을 분리해 저장합니다.
-- APPROVED는 승인일 뿐 완료가 아닙니다. 완료 처리와 권한 검증은 향후 서비스에서 구현합니다.
CREATE TABLE IF NOT EXISTS handover_requests (
  request_id INTEGER PRIMARY KEY,
  found_report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE RESTRICT,
  requester_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  lost_report_id INTEGER REFERENCES reports(report_id) ON DELETE RESTRICT,
  ownership_proof TEXT NOT NULL CHECK (length(trim(ownership_proof)) > 0),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED')),
  reviewer_id INTEGER REFERENCES users(user_id) ON DELETE RESTRICT,
  review_note TEXT,
  reviewed_at TEXT,
  recipient_name TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (status <> 'COMPLETED' OR (completed_at IS NOT NULL AND recipient_name IS NOT NULL AND length(trim(recipient_name)) > 0)),
  CHECK (status = 'COMPLETED' OR completed_at IS NULL)
) STRICT;
CREATE INDEX IF NOT EXISTS idx_handovers_requester ON handover_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_handovers_found ON handover_requests(found_report_id, status);

-- ERD의 보관·폐기 컬럼을 별도 테이블에 둡니다. 습득 신고 한 건에 현재 보관 기록 한 건입니다.
-- 처리 이력은 audit_logs에 남기며, 신고 상태와의 동시 갱신은 이후 서비스의 트랜잭션 책임입니다.
CREATE TABLE IF NOT EXISTS storage_records (
  storage_id INTEGER PRIMARY KEY,
  found_report_id INTEGER NOT NULL UNIQUE REFERENCES reports(report_id) ON DELETE RESTRICT,
  storage_place TEXT NOT NULL CHECK (length(trim(storage_place)) > 0),
  stored_at TEXT NOT NULL,
  storage_deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'STORED' CHECK (status IN ('STORED', 'HANDED_OVER', 'DISPOSED', 'TRANSFERRED')),
  disposition_note TEXT,
  disposed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_storage_deadline ON storage_records(status, storage_deadline);

-- 인계 대상은 습득 신고여야 하며, 선택한 연관 신고는 분실 신고여야 합니다.
CREATE TRIGGER IF NOT EXISTS validate_handover_insert
BEFORE INSERT ON handover_requests
WHEN NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.found_report_id AND report_type = 'FOUND')
  OR (NEW.lost_report_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.lost_report_id AND report_type = 'LOST'))
BEGIN
  SELECT RAISE(ABORT, 'handover requires FOUND and optional LOST report');
END;
CREATE TRIGGER IF NOT EXISTS validate_handover_update
BEFORE UPDATE OF found_report_id, lost_report_id ON handover_requests
WHEN NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.found_report_id AND report_type = 'FOUND')
  OR (NEW.lost_report_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.lost_report_id AND report_type = 'LOST'))
BEGIN
  SELECT RAISE(ABORT, 'handover requires FOUND and optional LOST report');
END;

-- 분실 신고가 보관 대상에 잘못 연결되지 않도록 등록과 수정 모두 확인합니다.
CREATE TRIGGER IF NOT EXISTS validate_storage_insert
BEFORE INSERT ON storage_records
WHEN NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.found_report_id AND report_type = 'FOUND')
BEGIN
  SELECT RAISE(ABORT, 'storage requires FOUND report');
END;
CREATE TRIGGER IF NOT EXISTS validate_storage_update
BEFORE UPDATE OF found_report_id ON storage_records
WHEN NOT EXISTS (SELECT 1 FROM reports WHERE report_id = NEW.found_report_id AND report_type = 'FOUND')
BEGIN
  SELECT RAISE(ABORT, 'storage requires FOUND report');
END;

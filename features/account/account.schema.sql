
-- [A 설계] 회원 식별·권한·신고 제한 정보입니다. 실제 비밀번호 해싱과 인증은 이후 구현합니다.
CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE CHECK (length(trim(login_id)) > 0),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(email)) > 0),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  report_blocked INTEGER NOT NULL DEFAULT 0 CHECK (report_blocked IN (0, 1)),
  blocked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 수신자별 알림과 읽은 시각을 저장합니다. 알림을 자동 생성·발송하는 기능은 별도입니다.
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('MATCH', 'HANDOVER', 'EXPIRY')),
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  target_path TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);

-- ERD의 ACTIVITY_LOGS를 역할분담 문서의 audit_logs 이름으로 구현합니다.
-- target_id는 대상 종류에 따라 테이블이 달라지므로 서비스에서 존재 여부를 검증해야 합니다.
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(user_id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN ('REPORT', 'HANDOVER', 'MATCH', 'USER')),
  target_id INTEGER NOT NULL CHECK (target_id > 0),
  action TEXT NOT NULL CHECK (length(trim(action)) > 0),
  detail_json TEXT CHECK (detail_json IS NULL OR json_valid(detail_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id, created_at);

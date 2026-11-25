
-- [A] 회원 식별·권한·신고 제한 정보입니다. 비밀번호는 scrypt 해시로 저장합니다.
CREATE TABLE IF NOT EXISTS users (
  -- 아이디·이메일은 중복될 수 없고, 비밀번호는 해시만 보관합니다.
  user_id INTEGER PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE CHECK (length(trim(login_id)) > 0),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(email)) > 0),
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- 일반 가입은 USER입니다. 신고 제한 여부와 종료일은 로그인 차단과 별개입니다.
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  report_blocked INTEGER NOT NULL DEFAULT 0 CHECK (report_blocked IN (0, 1)),
  blocked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- 수신자별 알림과 읽은 시각을 저장합니다. 알림을 자동 생성·발송하는 기능은 별도입니다.
CREATE TABLE IF NOT EXISTS notifications (
  -- user_id가 받는 사람입니다. read_at이 NULL이면 아직 읽지 않은 알림입니다.
  notification_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('MATCH', 'HANDOVER', 'EXPIRY')),
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  target_path TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
-- 자주 조회하는 수신자·읽음 상태를 인덱스로 묶어 검색을 돕습니다.
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

-- 세션 원본은 HttpOnly 쿠키, DB에는 SHA-256 해시만 저장합니다.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

# DB 스키마 — 4단계 구현 기록

기준일: 2026-11-12. 최상위 기준은 프로젝트 상위의 `Lost_and_Found_역할분담.md`입니다.
`최성규/diagram/ERD.drawio`는 컬럼과 관계의 보조 자료로 참고했습니다.
전체 스키마 설계는 사용자 합의에 따라 A(최성규)가 맡고, 기능별 파일 배치는 유지합니다.
이 문서는 현재 SQL의 구현 기록이며 5단계의 API·상태 전이 계약 확정 완료를 뜻하지 않습니다.

## 역할분담 문서와 ERD의 차이 반영

| ERD의 표현 | 현재 구현 | 이유 |
|---|---|---|
| `ACTIVITY_LOGS` | `audit_logs` | 역할분담 문서의 이름 유지 |
| `REPORTS.photo_urls` JSON 배열 | `report_photos`의 사진별 행 | B의 별도 사진 테이블 유지 |
| REPORTS의 보관·폐기 컬럼 | `storage_records` | D의 별도 보관 테이블 유지 |
| 간소화 ERD의 6개 테이블 | 아래 8개 테이블 | 역할분담 문서 우선 |
| 아키텍처 그림의 Supabase/PostgreSQL | Express + SQLite | 기존 합의와 역할분담 문서 우선 |

## 공통 저장 규칙

- ID는 `INTEGER PRIMARY KEY`, 문자열은 `TEXT`, 유사도는 `REAL`입니다. `STRICT` 테이블을 사용합니다.
- 선택 컬럼은 NULL을 허용하며, 나머지는 NOT NULL입니다. 날짜는 UTC ISO 8601 문자열 규약입니다.
- `created_at`, `updated_at` 기본값은 DB에서 생성합니다. 수정 시 `updated_at`은 서비스가 갱신해야 합니다.
- 날짜 문자열의 유효성, 이메일 형식, 비밀번호 해싱, 관리자 권한은 이후 서비스에서 검증해야 합니다.
- 모든 연결에서 외래 키 검사를 활성화합니다. 연결된 데이터를 물리 삭제하지 않도록 외래 키는 `ON DELETE RESTRICT`입니다.
- 신고 삭제는 `reports.deleted_at`을 이용한 논리 삭제를 전제로 합니다. 사용자 삭제 정책은 후속 인증 단계에서 정합니다.
- 운영 DB에 테스트 계정·데모 데이터는 자동 삽입하지 않습니다.

## 테이블과 컬럼

`?`는 NULL 허용입니다. 상세 CHECK·인덱스·트리거는 각 SQL 파일이 실행 기준입니다.

| 담당 기능 / SQL | 테이블 | 컬럼 |
|---|---|---|
| A / account.schema.sql | users | user_id, login_id, email, password_hash, name, role, report_blocked, blocked_until?, created_at |
| A / account.schema.sql | notifications | notification_id, user_id, type, message, target_path?, read_at?, created_at |
| A / account.schema.sql | audit_logs | log_id, actor_id?, target_type, target_id, action, detail_json?, created_at |
| B / reports.schema.sql | reports | report_id, author_id, report_type, item_name, category, place, occurred_at, description, status, deleted_at?, created_at, updated_at |
| B / reports.schema.sql | report_photos | photo_id, report_id, photo_url, sort_order, created_at |
| C / matching.schema.sql | matches | match_id, lost_report_id, found_report_id, source, similarity?, status, reviewed_by?, reviewed_at?, created_at |
| D / operations.schema.sql | handover_requests | request_id, found_report_id, requester_id, lost_report_id?, ownership_proof, status, reviewer_id?, review_note?, reviewed_at?, recipient_name?, completed_at?, created_at, updated_at |
| D / operations.schema.sql | storage_records | storage_id, found_report_id, storage_place, stored_at, storage_deadline, status, disposition_note?, disposed_at?, created_at, updated_at |

## 관계와 무결성

- users → reports.author_id / notifications.user_id / audit_logs.actor_id / matches.reviewed_by / handover_requests.requester_id·reviewer_id
- reports → report_photos.report_id / matches.lost_report_id·found_report_id / handover_requests.lost_report_id·found_report_id / storage_records.found_report_id
- `audit_logs.target_id`는 `target_type`에 따른 다형 참조이므로 DB 외래 키가 없습니다. 서비스가 실제 대상을 확인해야 합니다.
- login_id와 이메일은 중복 금지이며 이메일 비교는 대소문자를 구분하지 않습니다.
- 동일한 매칭 쌍과 동일 신고의 사진 순서는 중복 금지입니다. 습득 신고별 현재 보관 기록은 최대 한 건입니다.
- 매칭의 유사도는 NULL 또는 0~1입니다. audit_logs.detail_json은 NULL 또는 유효한 JSON입니다.
- 트리거로 매칭·인계·보관의 LOST/FOUND 방향을 검사하고, 등록된 신고의 유형 변경을 금지합니다.
- COMPLETED 인계는 수령인과 완료 일시가 필요합니다. APPROVED로 바꾸는 것만으로 신고나 인계가 완료되지 않습니다.
- 인계 중복 신청 정책, 관리자 검증, 상태 전이, 보관 기한 계산, 여러 테이블 동시 갱신은 아직 서비스로 구현하지 않았습니다.

## 저장 가능한 코드값 (현재 구현 초안)

| 대상 | 값 |
|---|---|
| users.role | USER, ADMIN |
| users.report_blocked | 0, 1 (제한 중 blocked_until=NULL이면 무기한) |
| reports.report_type | LOST, FOUND |
| reports.status | REPORTED, RECEIVED, STORED, MATCHED, HANDOVER_IN_PROGRESS, HANDED_OVER, DISPOSED, TRANSFERRED |
| matches.source / status | AUTO, ADMIN / CANDIDATE, CONFIRMED, REJECTED |
| handover_requests.status | REQUESTED, UNDER_REVIEW, APPROVED, REJECTED, COMPLETED |
| storage_records.status | STORED, HANDED_OVER, DISPOSED, TRANSFERRED |
| notifications.type | MATCH, HANDOVER, EXPIRY |
| audit_logs.target_type | REPORT, HANDOVER, MATCH, USER |

## 초기화와 변경

`pnpm db:init`은 account → reports → discovery → operations 순으로 SQL을 한 트랜잭션에 적용합니다.
성공 시 `PRAGMA user_version=1`로 기록하며 중간 오류는 롤백합니다.
재실행은 데이터를 삭제하지 않습니다. `CREATE TABLE IF NOT EXISTS`는 기존 컬럼을 변경하는 마이그레이션이 아닙니다.
이미 사용 중인 DB의 스키마를 수정할 때는 별도의 버전별 마이그레이션을 추가해야 합니다.
현재 코드보다 높은 DB 버전은 초기화를 거부합니다.

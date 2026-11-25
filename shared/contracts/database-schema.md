 > 2026-11-25 ABC 통합판: A/B/C 구현 및 DB v3 반영. D는 미구현입니다. 현재 통합 정책은 docs/ABC_통합결과.md와 각 계약 문서의 ABC 추가 내용을 우선합니다. 아래의 2026-11-15 미구현 표기는 당시 기록입니다.

# DB 스키마 — 버전 2 (A 인증 포함)

2026-11-15 갱신: 기존 업무 테이블 8개와 sessions 1개, 총 9개입니다. 가입·해싱·세션·알림·사용자 제한은 구현했습니다. 아래 B/C/D 업무 규칙은 각 담당자 구현이 필요합니다.

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
- A 서비스는 가입 이메일·비밀번호 해싱·제한 종료일·관리자 권한을 검증합니다. B/C/D의 업무 입력 검증은 각 서비스에서 구현해야 합니다.
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
| A / account.schema.sql | sessions | token_hash (PK), user_id (FK), expires_at, created_at |
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
성공 시 `PRAGMA user_version=2`로 기록하며 중간 오류는 롤백합니다. 버전 1 DB에는 sessions와 인덱스를 추가하고 기존 데이터는 보존합니다.
재실행은 데이터를 삭제하지 않습니다. `CREATE TABLE IF NOT EXISTS`는 기존 컬럼을 변경하는 마이그레이션이 아닙니다.
이미 사용 중인 DB의 스키마를 수정할 때는 별도의 버전별 마이그레이션을 추가해야 합니다.
현재 코드보다 높은 DB 버전은 초기화를 거부합니다.

sessions.user_id는 ON DELETE CASCADE이며 그 외 기존 업무 외래 키는 ON DELETE RESTRICT입니다. 원본 세션은 저장하지 않고 SHA-256 해시를 보관합니다. 세션은 7일 후 만료되고 로그인 시 만료 행을 정리합니다. 로그아웃은 현재 세션 행을 삭제합니다. API는 report_blocked의 원시 플래그 대신 종료일을 반영한 유효 제한 여부를 boolean으로 응답합니다.

## ABC DB v3

`reports.storage_place TEXT NOT NULL DEFAULT ''` 추가. 신고자가 입력한 현재 보관 장소를 구조화하며 description과 분리합니다. D의 실제 보관 접수는 storage_records를 사용합니다. 해당 D 기능은 미구현입니다.

`db:init`은 v2 기존 reports에 컬럼을 추가하고 FOUND 설명 선두의 `[보관 장소: ...]`를 이전합니다. 기존 신고·사용자·관계는 보존합니다. user_version=3이며 v3보다 높은 DB는 초기화를 거부합니다. 마이그레이션은 트랜잭션 내에서 실행되고 재실행 가능합니다.

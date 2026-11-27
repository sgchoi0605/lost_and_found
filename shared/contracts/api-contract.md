 > 2026-11-27 ABCD 통합 진행(1단계 완료): A/B/C 구현 + D 백엔드(`/api/operations`) 구현 및 DB v3 반영. D 프론트엔드 연동은 2단계 예정입니다. 아래의 2026-11-15/2026-11-25 D 미구현 표기는 과거 기록입니다.

# API 계약 — A 계정·공통 기반

2026-11-15 구현 기준. A(최성규)의 계정 API는 아래 계약으로 구현했습니다. B/C/D의 업무 API는 각 담당자가 구현해야 합니다. 이 문서가 전원 합의 완료를 의미하지는 않습니다.

## 공통 규칙

- 같은 출처에서 `/api/...`를 호출합니다. 개발 시 Vite가 `/api`를 Express 3000 포트로 전달합니다.
- 상태 변경 요청은 `Content-Type: application/json`과 JSON 객체를 사용합니다. 빈 요청도 `{}`를 보냅니다.
- 성공은 `{ "data": ... }`, 실패는 `{ "error": { "code": "...", "message": "..." } }`입니다. `/health`만 기존 연결 확인 응답을 유지합니다.
- 인증은 `lf_session` HttpOnly·SameSite=Lax 쿠키입니다. 토큰을 JS·localStorage에 저장하지 않습니다. `fetch`에 `credentials: 'same-origin'`을 사용하세요.
- 로그인은 7일 고정 만료, 재로그인 시 현재 쿠키의 이전 세션을 폐기합니다. 로그아웃은 현재 세션만 폐기합니다. 다른 기기의 세션은 유지됩니다.
- 공개 회원가입은 항상 USER입니다. ADMIN은 로컬 `pnpm admin:promote <아이디>`로 부여합니다.
- 로그인 아이디는 대소문자 구분, 이메일은 소문자로 정규화하고 대소문자 무관 중복 검사합니다.
- API는 `Cache-Control: no-store`입니다. 타 출처의 상태 변경 요청은 차단합니다.
- `/health`의 account-ready는 계정 코드 구현 상태만 표시하며 DB 연결·초기화 성공을 검사하지 않습니다. 실행 전에 db:init이 필요합니다.
- `page` 기본 1, `limit` 기본 20·최대 100. ID는 양의 정수. 날짜는 UTC ISO 8601입니다.

## 사용자 응답

```json
{
  "user_id": 1,
  "login_id": "student01",
  "email": "student01@example.com",
  "name": "학생",
  "role": "USER",
  "report_blocked": false,
  "blocked_until": null,
  "created_at": "2026-11-15T00:00:00.000Z"
}
```

`password_hash`와 세션 토큰은 응답하지 않습니다. `report_blocked`는 DB의 0/1 원시값이 아니라 **현재 유효한 제한 여부(boolean)**입니다. 종료일이 지난 제한은 false로 응답하며 신고 가드에서도 통과합니다.

## 엔드포인트

접두사는 `/api/account`입니다.

| 메서드·경로 | 권한 | 요청 | 성공 data |
|---|---|---|---|
| POST `/signup` | 공개 | 아래 가입 JSON | 사용자 객체, HTTP 201 |
| POST `/login` | 공개 | `{loginId,password}` | 사용자 객체 + Set-Cookie |
| GET `/me` | 로그인 | 없음 | 현재 사용자 객체 |
| POST `/logout` | 로그인 | `{}` | `{loggedOut:true}` + 쿠키 삭제 |
| GET `/notifications?page=1&limit=20` | 로그인 | 없음 | `{items,total,unreadCount,page,limit}` |
| PATCH `/notifications/:id/read` | 알림 소유자 | `{}` | 변경된 알림 객체 |
| PATCH `/notifications/read-all` | 로그인 | `{}` | `{updated:변경건수}` (본인 알림만) |
| GET `/admin/users?q=검색어&page=1&limit=20` | ADMIN | 없음 | `{items,total,page,limit}` |
| PATCH `/admin/users/:id/restriction` | ADMIN | 아래 제한 JSON | 변경된 사용자 객체 |
| GET `/health` | 공개 | 없음 | 예외 형식: `{feature:"account",status:"ok",stage:"account-ready"}` |

가입 요청:

```json
{"loginId":"student01","name":"학생","email":"student01@example.com","password":"test-password-123","confirmPassword":"test-password-123"}
```

- 아이디: 영문·숫자·`_`·`-` 4~30자. 이름: 공백 제거 후 1~50자. 이메일: 최대 254자·형식 검사.
- 비밀번호: 8~128자, 확인 일치 필수. 비밀번호의 앞뒤 공백은 제거하지 않습니다.
- 회원가입 후 자동 로그인하지 않습니다. 중복 아이디·이메일은 HTTP 409입니다.

신고 제한 요청:

```json
{"blocked":true,"reason":"반복적인 허위 신고 확인","until":"2026-12-01T00:00:00.000Z"}
```

`until` 생략·null은 무기한. 해제는 `{ "blocked": false, "reason": "소명 확인" }`. 사유는 1~500자 필수입니다. 관리자 계정 제한은 금지합니다. 권한 변경·사용자 삭제 API는 제공하지 않습니다. 관리자 검색은 아이디·이름·이메일 부분 일치이며 `%`, `_`도 문자 그대로 검색합니다.

알림 객체:

```json
{"notification_id":1,"user_id":1,"type":"MATCH","message":"유사한 습득물이 있습니다.","target_path":"/features/discovery/frontend/matches.html","read_at":null,"created_at":"2026-11-15T00:00:00.000Z"}
```

목록은 최신 ID 내림차순입니다. 읽음 처리는 반복해도 최초 `read_at`을 보존합니다. 타인의 알림 ID는 404입니다. 알림 생성은 공개 HTTP API 없이 C/D의 서버 코드에서 서비스 함수를 호출합니다. [호출 예제](../../docs/README.md)를 참고하세요.

## 오류 코드

| HTTP | code | 의미 |
|---|---|---|
| 400 | VALIDATION_ERROR / BAD_REQUEST | 필드 검증 실패 / 잘못된 JSON |
| 401 | INVALID_CREDENTIALS | 로그인 아이디 또는 비밀번호 불일치 |
| 401 | UNAUTHENTICATED | 로그인 없음·세션 만료 |
| 403 | FORBIDDEN | 관리자 권한 없음 |
| 403 | INVALID_ORIGIN | 타 출처 상태 변경 요청 |
| 403 | REPORT_BLOCKED | 유효한 신고 제한 (B가 공통 가드 적용 시) |
| 403 | ADMIN_RESTRICTION_DENIED | 관리자 계정 제한 시도 |
| 404 | USER_NOT_FOUND / NOTIFICATION_NOT_FOUND / NOT_FOUND | 대상 또는 경로 없음 |
| 409 | ACCOUNT_EXISTS | 아이디·이메일 중복 |
| 415 | JSON_REQUIRED | 상태 변경 요청의 JSON 헤더 누락 |
| 429 | RATE_LIMITED | 프로세스·IP별 가입/로그인 합산 15분 30회 초과 |
| 500 | INTERNAL_SERVER_ERROR | DB 미초기화 등을 포함한 서버 오류 |

서버 내부 경로·SQL·스택은 응답에 노출하지 않습니다. 상태 변경 API의 출처·JSON 검사가 라우터의 권한 검사보다 먼저 실행됩니다.

## B/C/D 계약 상태

`/api/reports`, `/api/discovery`, `/api/operations`는 기존 health 연결 확인만 구현돼 있습니다. 업무 API는 아직 없습니다. 새 API는 공통 성공·오류 형식과 인증 미들웨어를 사용하고 여기에 계약을 추가하세요. 신고·인계·매칭 상태 변경은 담당자 구현 후 통합 검증이 필요합니다.

## ABC 통합 계약 — 2026-11-25 현재 기준

A API는 위 계약을 유지합니다. B/C는 아래 업무 API가 구현되어 있으며, 위의 B/C 미구현 설명을 대체합니다. 인증·응답 래퍼·JSON 요청·권한 검사는 공통 규칙을 따릅니다.

### B: /api/reports

| 메서드 | 경로 | 권한 / 내용 |
|---|---|---|
| GET | /health | 공개, stage=reports-ready |
| GET | /photos/:fileName | 공개, 검증된 업로드 사진 |
| POST | / | 로그인+신고 가능, 신고 등록 |
| GET | /mine | 로그인, 본인 목록 page/limit |
| GET | /:id | 본인 또는 관리자, 수정용 상세 |
| PATCH | /:id | 본인, 전체 편집 필드 전달 |
| DELETE | /:id | 본인, 논리 삭제 |
| GET | /admin | 관리자, q/status/reportType/page/limit |
| PATCH | /admin/:id/status | 관리자, {status}, 기본 상태 전이만 허용 |
| DELETE | /admin/:id | 관리자, 논리 삭제 |

등록 입력: `{reportType,itemName,category,place,occurredAt,description,storagePlace?,photos?}`. 수정은 reportType 변경 불가, 나머지 기본 필드를 전달합니다. `storagePlace`는 습득 신고의 `storage_place`에 저장합니다. `description`은 특징만 담습니다. 날짜·시간은 시간대가 포함된 ISO를 권장하며 날짜 전용 입력은 UTC 자정으로 호환합니다.

목록 data는 `{items,total,page,limit}`, 등록/단건/수정은 신고 객체, 삭제는 `{report_id,deleted:true}`입니다. 등록은 HTTP 201입니다. 신고 객체의 DB 필드는 snake_case이며 사진은 `photos` 배열에 포함됩니다. 관리자 검색 q는 이름·설명의 대소문자 무관 부분 일치이며 %, _도 문자로 처리합니다.

사진은 기존 JSON 100KB 제한 내에서 프론트 압축 후 전송합니다. 최대 3장, 서버 바이너리 기준 장당 60KB·합계 65KB입니다. JPG/PNG 시그니처와 경로를 검사합니다.

기본 상태 전이: REPORTED → RECEIVED, FOUND만 RECEIVED → STORED. 그 외 409 INVALID_REPORT_TRANSITION. 확정 매칭, 진행/완료 인계, D 보관 기록, 기본 단계가 아닌 신고의 수정·삭제·상태 변경은 409 REPORT_LOCKED입니다. 404 REPORT_NOT_FOUND, 400 VALIDATION_ERROR도 반환합니다.

### C: /api/discovery

| 메서드 | 경로 | 권한 / 내용 |
|---|---|---|
| GET | /health | 공개, stage=discovery-ready |
| GET | /reports | 공개, q/reportType/category/place/startDate/endDate/status/page/limit |
| GET | /reports/:id | 공개, 삭제되지 않은 신고·사진·storage_place |
| GET | /matchable-reports | 로그인, 본인의 후보 생성 가능 신고 |
| POST | /reports/:id/matches | 작성자, {}, 후보 생성 |
| GET | /matches | 로그인, 본인의 매칭, reportId/page/limit |
| GET | /admin/matches | 관리자, status/page/limit |
| POST | /admin/matches/:id/review | 관리자, {action: CONFIRM 또는 REJECT 또는 RELEASE} |
| GET | /admin/stats | 관리자, startDate/endDate/reportType/category |

후보 생성 data: `{reportId,compared,eligible,created,existing}`. 매칭 목록 data: `{items,total,page,limit}`. 검토 data: `{match_id,previousStatus,status,reviewed_by,reviewed_at}`. 통계 data: `{filters,summary,byType,byCategory,byStatus,byDate,handover,categories}`. 상세는 신고 객체입니다.

오류: 400 VALIDATION_ERROR, 401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND, 충돌은 409 MATCH_CONFLICT/HANDOVER_CONFLICT/STORAGE_CONFLICT/INVALID_STATUS/INVALID_REPORT_STATUS/REPORT_UNAVAILABLE/RESTORE_UNAVAILABLE/STALE_MATCH. STALE_MATCH는 최신 신고가 후보 조건을 충족하지 않는 경우입니다.

후보 생성은 수동 실행입니다. B 수정·삭제 시 C의 invalidateReportCandidates(db, reportId, actorId)를 같은 트랜잭션에서 호출합니다. C의 검색·상세·매칭 서비스는 호출자로부터 db를 받으며 자체 연결을 열지 않습니다. 관리자 거절은 유지하고, 일반 후보 무효화는 감사 이력에 남깁니다.

### D: /api/operations (2026-11-27 1단계 구현 기준)

| 메서드 | 경로 | 권한 / 내용 |
|---|---|---|
| GET | /health | 공개, `stage=operations-ready` |
| POST | /handovers | 로그인, 습득물 인계 신청 (HTTP 201) |
| GET | /handovers/mine | 로그인, 본인 인계 신청 목록 (`status?`, `page`, `limit`) |
| GET | /admin/handovers | 관리자, 전체 인계 신청 목록·상태별 집계 (`q?`, `status?`, `page`, `limit`) |
| GET | /admin/handovers/:id | 관리자, 인계 신청 단건 상세 (습득물·분실물·신청자·보관 기록 포함) |
| PATCH | /admin/handovers/:id/status | 관리자, 심사 상태 변경 (`{status: UNDER_REVIEW \| APPROVED \| REJECTED, reviewNote?}`) |
| POST | /admin/handovers/:id/complete | 관리자, 실물 인계 완료 (`{recipientName, completedAt?}`) |
| GET | /admin/storage | 관리자, 보관 물품 목록·집계 (`q?`, `status?`, `retention?`, `withinDays?`, `page`, `limit`) |
| GET | /admin/storage/candidates | 관리자, 보관 기록 미등록 습득 신고 목록 (`q?`, `page`, `limit`) |
| POST | /admin/storage | 관리자, 습득물 보관 접수 등록 (HTTP 201) |
| PATCH | /admin/storage/:id | 관리자, 보관 중인 물품의 보관 장소·기한 수정 (`{storagePlace?, storageDeadline?}`) |
| POST | /admin/storage/:id/dispose | 관리자, 보관 물품 폐기·이관 (`{status: DISPOSED \| TRANSFERRED, dispositionNote, disposedAt?}`) |
| POST | /admin/storage/check-retention | 관리자, 보관 기한 임박·초과 점검 및 `EXPIRY` 알림 발송 (`{withinDays?}`) |

- 인계 신청 입력: `{foundReportId, lostReportId?, ownershipProof, contact?}`. DB 스키마를 변경하지 않고 `contact`가 전달되면 `[연락처: ...]` 형식으로 `ownership_proof`에 함께 저장합니다.
- 인계 상태 전이는 정방향만 허용합니다(`REQUESTED → UNDER_REVIEW/APPROVED/REJECTED`, `UNDER_REVIEW → APPROVED/REJECTED`, `APPROVED → COMPLETED`). 완료·처리 후 대기 상태 되돌리기(`resetStatus`)는 제공하지 않습니다.
- 인계 신청 시 습득 신고(및 연결된 본인 분실 신고)는 `HANDOVER_IN_PROGRESS`로 전환되며, `REJECTED` 시 신청 직전 신고 상태로 복원합니다. `COMPLETED`는 수령인과 완료 일시를 기록하고 `handover_requests`·`reports`·`storage_records`를 한 트랜잭션으로 `COMPLETED`/`HANDED_OVER` 갱신합니다.
- 보관 접수 입력: `{foundReportId, storagePlace?, storedAt?, storageDeadline?, retentionDays?}`. `storagePlace` 생략 시 `reports.storage_place`를 초기값으로 사용하며, `storageDeadline` 생략 시 기본 180일(`retentionDays`)로 계산합니다.
- 보관 정보 수정(`PATCH /admin/storage/:id`)은 `storage_records`의 보관 장소·기한만 변경하며 B의 `reports` 핵심 필드를 덮어쓰지 않습니다.
- 폐기·이관(`POST /admin/storage/:id/dispose`)은 진행 중인 인계(`HANDOVER_CONFLICT`)나 확정 매칭(`MATCH_CONFLICT`)이 있으면 409로 차단하며, 일반 매칭 후보는 C의 `invalidateReportCandidates()`로 무효화하고 `storage_records`와 `reports`를 함께 종료 상태로 갱신합니다.
- 주요 오류: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `REPORT_NOT_FOUND`/`HANDOVER_NOT_FOUND`/`STORAGE_NOT_FOUND`, 409 `HANDOVER_ALREADY_EXISTS`/`STORAGE_ALREADY_EXISTS`/`INVALID_REPORT_STATUS`/`INVALID_HANDOVER_TRANSITION`/`INVALID_STORAGE_STATUS`/`HANDOVER_CONFLICT`/`MATCH_CONFLICT`/`STORAGE_CONFLICT`.
- 인계 생성·상태 변경·완료 시 A의 `createNotification`으로 `HANDOVER` 알림을, 기한 점검 시 관리자에게 중복 없이 `EXPIRY` 알림을 생성하고 모든 변경은 `audit_logs`에 같은 트랜잭션으로 기록합니다.

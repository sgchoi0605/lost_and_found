# ABCD 통합 결과 및 파일별 수정 내역

작성일: 2026-11-27

기존 ABC 통합본(`Lost_and_Found_ABC`)에 비어 있던 D(인계·보관) 백엔드를 신규 구현하고, 임시 `localStorage`로 동작하던 D 프론트엔드 5개 화면을 실제 서버 API와 공통 보안 모듈에 연결했습니다. C 화면의 인계 진입 버튼, 메인 관리자 메뉴, 전체 자동화 테스트도 함께 통합했습니다. 기존 A·B·C 핵심 로직과 DB v3 스키마는 변경하지 않았습니다.

---

## 1. 실행 방법

Node.js(SQLite 내장 버전)와 pnpm 10.34.9, 기존 `pnpm-lock.yaml`을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm db:init
pnpm start
```

`http://127.0.0.1:3000`에 접속합니다. 회원가입 후 `pnpm admin:promote <아이디>`로 관리자를 지정할 수 있습니다. `pnpm build`는 프론트엔드 빌드 검사이며 Express 서버를 대체하지 않습니다.

pnpm이 PATH에 없으면 `npm run db:init`, `npm start`, `npm test`, `npm run build`로도 동일하게 실행할 수 있습니다.

---

## 2. 파트별 구현과 정책

- **A (계정·공통)**: 가입, 로그인, DB 세션, 알림 목록·읽음, 관리자 사용자 제한, 서버·공통 보안 (`account-ready`).
- **B (신고)**: 분실·습득 신고, 사진 업로드, 본인 수정·삭제, 관리자 검색·접수·보관, 페이지 이동 (`reports-ready`).
- **C (검색·매칭·통계)**: 검색·상세·유사 물품 후보·관리자 확정/거절/해제·통계 (`discovery-ready`).
- **D (인계·보관)**: 습득물 인계 신청·내 현황 조회, 관리자 정방향 심사 및 실물 인계 완료, 보관 접수·수정·기한 점검·`EXPIRY` 알림·폐기/이관 (`operations-ready`).

### 인계 상태 전이와 동기화

인계 상태는 정방향 전이만 허용합니다(`REQUESTED → UNDER_REVIEW | APPROVED | REJECTED`, `UNDER_REVIEW → APPROVED | REJECTED`, `APPROVED → COMPLETED`). 처리 후 대기 상태로 되돌리는 기능(`resetStatus`)은 타 파트 잠금 규칙과 충돌하므로 제거했습니다.

인계 신청 시 습득 신고(및 연결된 분실 신고)는 `HANDOVER_IN_PROGRESS`로 변경됩니다. 거절(`REJECTED`) 시 감사 로그(`HANDOVER_CREATE`)에 저장된 직전 신고 상태로 복원해 재신청할 수 있습니다. 실물 인계 완료(`COMPLETED`)는 `APPROVED` 상태에서만 허용하며, `handover_requests`, `reports`, `storage_records`를 한 트랜잭션으로 `COMPLETED`/`HANDED_OVER` 처리하고 감사 로그와 `HANDOVER` 알림을 함께 기록합니다.

### 보관·연락처와 기한 관리

DB 버전은 3을 그대로 유지했습니다. 별도 연락처 컬럼을 추가하지 않고, 인계 신청 시 선택 입력한 연락처는 `[연락처: ...]` 형식으로 `ownership_proof`에 포함해 저장합니다.

보관 접수 시 보관 장소를 비워 두면 `reports.storage_place`를 초기값으로 사용합니다. 보관 기한을 입력하지 않으면 기본 180일로 자동 계산합니다. 보관 접수 시 신고 상태는 `REPORTED`·`RECEIVED`일 때만 `STORED`로 전이하며, 이미 `MATCHED`나 `HANDOVER_IN_PROGRESS`인 경우 기존 상태를 유지합니다. 보관 정보 수정은 `storage_records`의 장소·기한만 수정하며 B의 `reports` 필드를 덮어쓰지 않습니다.

보관 기한은 `NORMAL`, `EXPIRING_SOON`(기본 7일 이내), `EXPIRED`, `CLOSED`로 분류합니다. 기한 점검(`check-retention`)을 실행하면 만료·임박 건에 대해 관리자 대상 중복 없는 `EXPIRY` 알림을 발송하며, CLI 단독 실행도 지원합니다.

보관 물품 폐기(`DISPOSED`)·이관(`TRANSFERRED`) 시 활성 인계(`409 HANDOVER_CONFLICT`)와 확정 매칭(`409 MATCH_CONFLICT`)이 있으면 차단합니다. 일반 후보 매칭(`CANDIDATE`)은 C의 `invalidateReportCandidates()`로 무효화하고 `storage_records`와 `reports`를 함께 종료 상태로 변경합니다.

---

## 3. 통합 기준과 파일별 수정 내역

| 영역 | 작업 범위 | 핵심 변경 요약 |
|---|---|---|
| A 계정·공통 | 최소 수정 | 기존 로그인·세션·알림·보안 로직 유지. 계약 문서와 서버·테스트 설정만 갱신 |
| B 신고 | 변경 없음 | 기존 ABC 통합본의 신고·사진·잠금 정책 그대로 유지 |
| C 검색·매칭·통계 | 최소 수정 | 상세 화면 인계 신청 버튼 활성화, 메인 화면 사용자·관리자 전체 메뉴 연결 |
| D 인계·보관 | 백엔드 신규·프론트 실연동 | `/api/operations/*` 13개 API 구현, 5개 화면 `localStorage` 제거 및 실API 연동 |

### D 인계·보관 백엔드에서 구현한 파일

기존 빈 파일들을 채워 인계 신청·심사·완료와 보관·기한·폐기/이관 업무를 구현했습니다. 공통 `req.db`, `requireAuth`, `requireAdmin`, `transaction`, `recordAudit`, `HttpError`와 A의 `createNotification`, C의 `invalidateReportCandidates`를 그대로 재사용했습니다.

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| `features/operations/backend/handover.repository.js` | 신규 구현 | 인계 단건·목록·집계·중복 신청·직전 신고 상태 조회 및 저장 SQL 구현 | 인계 데이터 조회·저장과 거절 시 원복을 DB 기준으로 처리하기 위해 |
| `features/operations/backend/handover.service.js` | 신규 구현 | 습득물 유효성·중복 검증, 연락처 `ownership_proof` 포함 저장, 정방향 심사(`UNDER_REVIEW`/`APPROVED`/`REJECTED`), 실물 완료(`COMPLETED`) 시 `reports`·`storage_records` 동시 갱신 및 알림·감사 로그 기록 | DB v3 스키마를 깨지 않으면서 인계와 신고·보관 상태를 한 트랜잭션으로 일치시키기 위해 |
| `features/operations/backend/handover.controller.js` | 신규 구현 | 인계 신청·내 목록·관리자 목록/상세/심사/완료 HTTP 컨트롤러 구현 | 요청 검증과 공통 응답 형식 연결을 위해 |
| `features/operations/backend/storage.repository.js` | 신규 구현 | 보관 기록·미등록 습득물 후보·기한별 집계 조회 및 저장·수정·폐기 SQL 구현 | 보관 관리와 미등록 습득물 접수 화면을 지원하기 위해 |
| `features/operations/backend/storage.service.js` | 신규 구현 | 보관 접수(`reports.storage_place` 초기값·180일 기한), 장소·기한 수정(`reports` 비침범), 폐기/이관 시 활성 인계·확정 매칭 차단 및 후보 매칭 무효화 구현 | B의 신고 데이터와 C의 확정 매칭을 보호하면서 보관 생명주기를 관리하기 위해 |
| `features/operations/backend/storage.controller.js` | 신규 구현 | 보관 목록·후보·접수·수정·폐기/이관·기한 점검 HTTP 컨트롤러 구현 | 관리자 보관 API 엔드포인트 연결을 위해 |
| `features/operations/backend/retention.job.js` | 신규 구현 | 보관 기한 상태(`NORMAL`/`EXPIRING_SOON`/`EXPIRED`/`CLOSED`) 계산 및 관리자 중복 방지 `EXPIRY` 알림 발송 구현(API·CLI 겸용) | 보관 기한 임박·초과 물품을 자동 점검하고 중복 알림을 막기 위해 |
| `features/operations/backend/index.js` | 수정 | `/api/operations/*` 라우터 연결 및 `/health`의 `stage`를 `routing-only`에서 `operations-ready`로 변경 | D 업무 API 활성화 및 준비 상태 표시를 위해 |

### D 인계·보관 프론트엔드에서 수정한 파일

5개 화면에서 임시 저장소(`localStorage`)와 빈 배열, `window.alert`를 모두 제거하고 공통 모듈(`api.js`, `auth-guard.js`, `toast.js`)로 통일했습니다. 모든 데이터 출력은 `textContent`와 DOM API만 사용합니다.

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| `features/operations/frontend/js/operations-common.js` | 추가 | DB 영문 상태 코드↔한글 라벨 매핑, 날짜/UTC 변환, 연락처 분리, 안전 배지 헬퍼 추가 | D 5개 화면이 동일한 상태 코드와 표시 형식을 쓰도록 통일하기 위해 |
| `features/operations/frontend/*.html` (5개) | 수정 | `../../discovery/frontend/index.html`을 `/features/discovery/frontend/index.html`로 수정, 내비게이션 추가, 필터 값을 DB 영문 코드로 통일, `admin-storage.html`에 기한·폐기/이관 UI 추가 | 짧은 URL(`/operations/*.html`) 404 오류를 해결하고 실제 DB 상태·보관 업무를 화면에 반영하기 위해 |
| `features/operations/frontend/js/*.js` (5개) | 수정 | `localStorage`·빈 배열 제거, 실API 및 로그인/관리자 가드 연결, `handover-apply.js`에서 `?foundReportId=` 습득물·본인 분실 신고 조회 연동 | 가짜 임시 동작을 없애고 권한 보호와 실제 서버 통신을 적용하기 위해 |
| `features/operations/frontend/css/operations.css` | 수정 | `body`, `form`, `button`, `input` 전역 태그 스타일 덮어쓰기를 제거하고 `.ops-*` 전용 클래스와 공통 색상 변수(`base.css`)로 정리 | A·B·C 공통 디자인과 화면 스타일이 충돌하는 문제를 방지하기 위해 |

### C 화면과 공통·테스트에서 수정한 파일

| 파일 | 구분 | 무엇을 어떻게 바꿨는가 | 수정 이유 |
|---|---|---|---|
| `features/discovery/frontend/js/report-detail.js` | 수정 | 숨겨 두었던 `인계 신청하기` 링크를 활성화하고 "준비 중" 안내 제거 | D 인계 신청 기능이 완성됨에 따라 상세보기에서 바로 진입할 수 있게 하기 위해 |
| `features/discovery/frontend/js/index.js` | 수정 | 로그인 사용자용 `내 인계 신청 현황 →` 링크와 관리자 6개 전체 메뉴(사용자·신고·매칭·인계·보관·통계) 연결 | 메인 화면에서 모든 파트 기능으로 바로 이동할 수 있도록 하기 위해 |
| `shared/contracts/api-contract.md`, `status-definitions.md` | 수정 | `/api/operations/*` 13개 엔드포인트 명세와 D 정방향 상태 전이·보관 규칙 추가 | 코드와 계약 문서를 일치시키기 위해 |
| `features/operations/operations.test.js` | 신규 구현 | 인계 신청·중복·권한·정방향 심사·완료 동기화·거절 복원·보관 접수/수정/기한 알림/폐기·충돌 차단 5개 HTTP 테스트 작성 | D 백엔드 전체 업무 규칙과 권한·충돌 차단을 자동 검증하기 위해 |
| `tests/integration.test.js` | 수정 | 가입(A)→신고(B)→검색·매칭(C)→보관·인계 완료·만료 폐기(D)→알림(A)·통계 완료율 50%(C) E2E 테스트 1건 추가 | 4개 파트 연동 흐름이 깨지지 않는지 한 번에 검증하기 위해 |
| `shared/backend/server.test.js`, `scripts/test.mjs`, `package.json` | 수정 | `/api/operations/health` 기대값을 `operations-ready`로 변경하고 기본 테스트와 `test:operations` 스크립트에 D 테스트 추가 | `pnpm test` 한 번으로 A·B·C·D 전체를 검사할 수 있게 하기 위해 |

---

## 4. 수정 전후의 실제 처리 흐름

### 인계 신청 및 완료

**수정 전:** 상세보기에서 인계 신청 버튼이 숨겨져 있었고, D 화면은 `?foundReportId=`를 읽지 못한 채 `localStorage`에 한글 상태 문자열(`"인계 대기"` 등)만 임시 저장했습니다.

**수정 후:** 상세보기·매칭 화면에서 `?foundReportId=`로 진입하면 실제 습득물과 본인 분실 신고를 불러와 신청합니다. 관리자가 `UNDER_REVIEW`/`APPROVED`를 거쳐 실물 인계 완료(`COMPLETED`)를 누르면 `handover_requests`, `reports`, `storage_records`가 한 트랜잭션으로 `HANDED_OVER` 처리되고 알림과 감사 로그가 함께 남습니다.

### 보관 기한 및 폐기·이관

**수정 전:** 보관 화면이 빈 배열(`storageItems = []`)로 동작해 등록·기한 관리·폐기/이관 처리가 불가능했고, "물품 정보 저장" 기능이 B의 신고 필드를 덮어쓸 위험이 있었습니다.

**수정 후:** 미등록 습득물을 `reports.storage_place` 초기값과 기본 180일 기한으로 접수하고, 수정 시에는 `storage_records`만 갱신합니다. 기한 점검 시 관리자 `EXPIRY` 알림을 중복 없이 발송하며, 폐기(`DISPOSED`)·이관(`TRANSFERRED`) 시 활성 인계·확정 매칭이 있으면 409로 차단하고 일반 후보는 자동 무효화합니다.

### 화면 경로 및 메뉴 연결

**수정 전:** D 화면 3곳의 메인 링크가 `../../discovery/frontend/index.html`로 되어 있어 짧은 URL(`/operations/*.html`) 접속 시 404 오류가 발생했고, 메인에서 D 화면으로 이동할 링크가 없었습니다.

**수정 후:** 모든 D 화면 링크를 `/features/discovery/frontend/index.html`로 통일해 짧은/긴 URL 모두 200 OK를 통과했고, 메인에 일반 사용자 `내 인계 신청 현황`과 관리자 6개 전체 메뉴를 연결했습니다.

---

## 5. 검사 및 최종 검증 결과

`pnpm test`는 공통·A·B·C·D 및 `tests/integration.test.js` 전체를 실행하며, D 단독 검사는 `pnpm test:operations`로 실행할 수 있습니다. 통합 테스트는 기존 ABC 회귀 8건에 더해 회원가입(A) → 분실·습득 신고(B) → 검색·매칭(C) → 보관 접수·인계 완료·기한 만료 폐기(D) → `MATCH`/`HANDOVER`/`EXPIRY` 알림(A) 및 통계 인계 완료율(C) 반영까지 한 번에 검증합니다.

- **검증 환경**: Node.js v26.13.1, pnpm 10.34.9, Express 5.3.0, Vite 8.0.5, SQLite(`node:sqlite`, DB v3).
- **`pnpm db:init`**: `database/lostfound.db` 9개 테이블 초기화 성공.
- **`pnpm test`**: 총 **65개 테스트 전원 통과** (실패 0, 건너뜀 0, 실행 시간 2.44초).
  - 구성: 공통 DB 8개, 서버 5개, A 9개, B 5개, C 24개, D 5개, 통합 회귀·E2E 9개.
- **`pnpm build`**: Vite 8.0.5 프로덕션 빌드 통과 (57개 모듈, 루트 및 4개 파트 20개 HTML 에러 0건, 237ms).
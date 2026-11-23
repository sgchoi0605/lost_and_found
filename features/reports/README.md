# B파트 — 분실·습득물 신고 및 관리

## 1. 구현 개요 & 개발 환경

- **담당 범위:** 분실·습득 신고 등록, 사진 업로드·조회, 본인 신고 관리(목록·수정·삭제), 관리자 신고 관리(조회·상태 변경·삭제)
- **기술 스택:** HTML · CSS · JS / Node.js · Express / SQLite (`reports`, `report_photos`)
- **공통 연동:** A파트 인증·권한·트랜잭션·감사 로그·공통 `api.js` 재사용 (추가 npm 패키지 없음)

---

## 2. 구현 페이지 (5개)

| 파일 | 주요 기능 |
| --- | --- |
| `lost-report.html` | 분실물 등록 (로그인·신고 제한 확인, 사진 최대 3장 자동 압축) |
| `found-report.html` | 습득물 등록 (로그인·신고 제한 확인, 보관 장소 입력, 사진 최대 3장 자동 압축) |
| `my-reports.html` | 내 신고 목록 조회, 상태 배지 표시, 상세·수정 이동 및 삭제 |
| `report-edit.html` | 내 신고 수정(유형 변경 불가, 습득물 보관 장소 분리 편집) 및 삭제 |
| `admin-reports.html` | 관리자 전체 신고 조회, 상태 필터(8종), 상태 변경 및 삭제 |

> 보조 모듈 `frontend/js/reports-common.js`로 상태 매핑·사진 압축·보관 장소 분리를 공통 처리합니다. 더미 데이터 없이 실제 API 응답만 표시합니다.

---

## 3. API 명세 (`/api/reports`)

- **공통 형식:** 성공 `{ "data": ... }` / 실패 `{ "error": { "code", "message" } }`
- **공통 규칙:** `POST`·`PATCH`·`DELETE`는 `Content-Type: application/json` 필수 (`DELETE` 본문은 `{}`)

### 3.1 전체 목록

| Method | Endpoint | 권한 | 기능 |
| --- | --- | --- | --- |
| `GET` | `/health` | 공개 | 연결 확인 (`stage: 'routing-only'` 유지) |
| `GET` | `/photos/:fileName` | 공개 | 업로드된 사진 이미지 반환 |
| `POST` | `/` | 로그인 + 신고 가능 | 분실·습득 신고 등록 (`201`) |
| `GET` | `/mine` | 로그인 | 본인 신고 목록 조회 (`page`, `limit`) |
| `GET` | `/:id` | 본인 또는 관리자 | 수정용 신고 단건 조회 |
| `PATCH` | `/:id` | 본인 | 본인 신고 수정 |
| `DELETE` | `/:id` | 본인 | 본인 신고 논리 삭제 |
| `GET` | `/admin` | 관리자 | 전체 신고 조회 (`status`, `reportType`, `page`, `limit`) |
| `PATCH` | `/admin/:id/status` | 관리자 | 신고 상태 변경 |
| `DELETE` | `/admin/:id` | 관리자 | 관리자 신고 논리 삭제 |

### 3.2 핵심 요청·응답 요약

| 구분 | 요청 핵심 | 응답 `data` / 주요 제약 |
| --- | --- | --- |
| **등록** (`POST /`) | `reportType`(`LOST`/`FOUND`), `itemName`, `category`, `place`, `occurredAt`, `description`, `storagePlace?`, `photos?[]` | 생성된 신고 + `photos[]`<br>작성자는 `req.user.user_id` 고정, 초기 상태 `REPORTED`, 제한 계정 `403` |
| **목록** (`GET /mine`, `/admin`) | `page`(기본 1), `limit`(기본 20, 최대 100), 관리자 `status`/`reportType` | `{ items, total, page, limit }` (대표 `photo_url` 포함, 삭제 건 제외) |
| **수정** (`PATCH /:id`) | `itemName`, `category`, `place`, `occurredAt`, `description`, `storagePlace?` | 수정된 신고 (`updated_at` 갱신)<br>본인 외 `403`, `reportType` 변경 시도 `400` |
| **삭제** (`DELETE /:id`, `/admin/:id`) | `{}` | `{ report_id, deleted: true }` (`deleted_at` 논리 삭제) |
| **상태 변경** (`PATCH /admin/:id/status`) | `{ status }` (DB 계약 8종 중 하나) | 변경된 신고 객체 (일반 계정 `403`, 잘못된 상태 `400`) |

---

## 4. 핵심 처리 정책

| 항목 | 처리 방식 |
| --- | --- |
| **사진 업로드** | 공통 100KB JSON 제한 준수: 프론트 캔버스 자동 압축(최대 3장, JSON 95KB 이하 확인) → 백엔드 JPG/PNG 시그니처·크기 검증(장당 60KB / 합계 65KB) → `uploads/reports/` 저장 후 같은 출처 URL(`/api/reports/photos/<파일명>`) 저장. DB 실패 시 임시 파일 자동 삭제 |
| **유형 변경 금지** | DB 트리거(`prevent_report_type_change`) 반영: 수정 화면 `disabled` + 서버 변경 차단(`400`) |
| **보관 장소 저장** | 습득물 `storagePlace`를 `description` 앞에 `[보관 장소: ...]`로 통합 저장. 수정 시 기존 문구 분리·치환해 중복 방지 |
| **논리 삭제** | 물리 삭제 대신 `deleted_at` 기록, 모든 조회에서 `deleted_at IS NULL` 필터 적용 |
| **권한·감사 로그** | 등록 `requireCanReport`, 수정·삭제 본인 검사(`author_id === user_id`), 관리자 `requireAdmin`. 모든 쓰기 작업은 `transaction` + `audit_logs`(`CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `ADMIN_DELETE`) 기록 |

---

## 5. 타 파트 연동 사항

| 파트 | 연동 내용 |
| --- | --- |
| **A파트** | `req.db`, `requireAuth`·`requireCanReport`·`requireAdmin`, `transaction`, `recordAudit`, `api.js`·`auth-guard.js` 재사용 / `/health` 응답 유지 |
| **C파트** | 사진 URL을 같은 출처 경로(`/api/reports/photos/...`)로 저장해 C 상세 화면 이미지 표시 호환 / `occurred_at` UTC ISO·초기 상태 `REPORTED`·`deleted_at` 일치 / `my-reports` → C 상세 링크 연결 |
| **D파트** | DB 계약 상태값 8종(`REPORTED`~`TRANSFERRED`) 그대로 적용 / 습득물 보관 장소는 `description` 헤더로 우선 기록 |

---

## 6. 테스트 결과

- **구현 완료:** `features/reports/reports.test.js` (메모리 DB + 임시 업로드 폴더 기반 5개 스위트: 인증/JSON/health, 등록·사진·신고 제한, 소유권·수정·논리 삭제, 관리자 기능·감사 로그, 사진 오류·고아 파일 정리)
- **확인 완료:** `node --check` 문법 검사 통과 (백엔드 5개 · 프론트 6개 · 테스트 1개)
- **자동 테스트 실행 상태:** **로컬 `main` 병합 후 실행 예정** (현재 `B` 폴더에 최신 `main` 공통 서버·의존성 미병합 상태)

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:init
node --test features/reports/reports.test.js
corepack pnpm test
corepack pnpm build
```

---

## 7. 추가 협의 사항

- **[B ↔ C] 등록 직후 자동 매칭:** 신고 등록 시 C 매칭 자동 호출 여부 vs 사용자 수동 실행 유지
- **[B ↔ C] 수정·삭제 시 매칭 처리:** 신고 수정·논리 삭제 시 기존 `matches` 후보/확정 데이터 갱신 정책
- **[B ↔ A] 사진 업로드 확장 여부:** 현재 JSON 100KB 경량 방식 유지 vs 향후 `multipart/form-data` 확장
- **[B ↔ D] 보관 장소 연계:** 습득물 `storagePlace`를 D의 `storage_records`와 연결할지 여부
- **[B ↔ A] 공통 반영:** `shared/contracts/api-contract.md`에 B API 추가, `pnpm test` 포함 및 `/health` `stage` 값 조율

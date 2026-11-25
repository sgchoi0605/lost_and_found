 > 2026-11-25 ABC 통합판: A/B/C 구현 및 DB v3 반영. D는 미구현입니다. 현재 통합 정책은 docs/ABC_통합결과.md와 각 계약 문서의 ABC 추가 내용을 우선합니다. 아래의 2026-11-15 미구현 표기는 당시 기록입니다.

# Lost & Found 웹프로그래밍 팀 프로젝트
## 4인 업무 분담 및 폴더 구조 개편안

> **진행 현황 (2026-11-15)**: 1단계 공통 기반 및 2단계 A 구현 완료. 실제 프로젝트의 [A 완료·연동 가이드](Lost_and_Found/docs/README.md)와 [작업 기록](Lost_and_Found/docs_A/work-logs/2026-11-15-A-2단계-완료.md)을 확인하세요. 아래 설계안의 파일 트리와 비교해 로그인용 sessions 테이블·DB 버전 2가 추가되었습니다. B/C/D 업무 구현 및 3단계 전체 통합 테스트는 미완료입니다.

> **문서 목적**: 팀원 4명이 각각 **자기 기능 폴더 안에서 HTML·CSS·JavaScript·백엔드까지** 맡아 개발하고, 통합 과정에서 파일 수정 충돌을 최소화하기 위한 작업 기준.
>
> **문서 성격**: 현재 UI 초안과 업로드된 기능 명세서·다이어그램·과제 지침을 참고한 **제안 설계안**이다. 아래의 신규 파일, 폴더, 데이터베이스 테이블 및 API는 기존 소스에 이미 구현된 것으로 오해하지 말 것.

---

## 1. 개발 원칙 및 기술 스택

- **담당 방식**: HTML/CSS/JS/백엔드를 기술별로 분리하지 않고, **기능별 세로 분할(Feature-based / Vertical Slice)** 한다.
- **팀원 A**: 회원·인증·알림·사용자 관리 + 공통 기반
- **팀원 B**: 분실·습득 신고 + 관리자 신고 관리
- **팀원 C**: 메인·검색·매칭·통계
- **팀원 D**: 인계·보관·폐기
- **권장 스택(확정 전 제안)**: HTML + CSS + JavaScript + Node.js/Express + SQLite. Bootstrap은 선택. 기존 UI는 정적 HTML·CSS·JS 및 Vite 관련 설정으로 구성되어 있으며, Express/SQLite는 새로 도입할 기술이다.
- **교수님 과제 조건**: 각 팀원이 최소 하나 이상의 웹 화면 구현에 참여하고, 각 웹 페이지에 HTML·CSS·JavaScript를 사용할 것. 백엔드 구현은 팀의 자체 목표로 추가한다.
- **팀원 간 연동**: 다른 사람의 파일을 직접 고치는 대신 합의된 API·데이터 스키마를 이용한다.

## 2. 팀원별 업무 요약

| 담당 | 소유 폴더 | 담당 화면 | 프론트엔드·백엔드 책임 | 주요 DB 테이블(제안) |
|---|---|---:|---|---|
| **A** | `features/account/`, `shared/` | 4개 | 로그인·회원가입·알림·관리자 사용자 관리 / 공통 서버·인증·DB 연결 | `users`, `notifications`, `audit_logs` |
| **B** | `features/reports/` | 5개 | 분실·습득 신고 CRUD, 사진 업로드, 신고 내역, 관리자 신고 관리 | `reports`, `report_photos` |
| **C** | `features/discovery/` | 6개 | 메인, 검색/필터, 상세보기, 유사 물품 매칭, 관리자 매칭, 통계 | `matches` *(조회 시 `reports` 등 참조)* |
| **D** | `features/operations/` | 5개 | 인계 신청·상태 조회·승인/거절/완료, 보관 기간, 폐기·이관 | `handover_requests`, `storage_records` |
| **합계** | 4개 기능 폴더 + 공통 폴더 | **20개** | 기능별 화면과 백엔드 구현 | 공통 DB 사용 |

> 화면 개수는 **설계용 기준**이다. 기능을 생략하는 것이 아니라 탭·모달 등으로 합치기로 합의하면 파일 수는 조정할 수 있다.

## 3. 최종 권장 폴더 트리

`[A]` 등은 파일 소유자 표시이며 실제 폴더 이름에 포함하지 않는다.

```text
lost-found/
├── package.json                      [A] 프로젝트 실행 스크립트·의존성
├── package-lock.json                 [A] 의존성 잠금 (npm 채택 시)
├── .gitignore                        [A]
├── .env.example                      [A]
├── README.md                         [A] 실행 방법·팀 규칙
│
├── shared/                            [A] 공통 코드는 A만 직접 수정
│   ├── frontend/
│   │   ├── css/
│   │   │   ├── base.css               공통 글꼴·색상·레이아웃
│   │   │   └── components.css         네비게이션·버튼·폼 공통 스타일
│   │   └── js/
│   │       ├── api.js                 공통 fetch 처리
│   │       ├── layout.js              공통 헤더·메뉴 표시
│   │       ├── auth-guard.js          페이지 접근 UX 가드
│   │       └── toast.js               알림·에러 메시지 UI
│   ├── backend/
│   │   ├── server.js                  Express 시작점·라우터 결합
│   │   ├── database.js                SQLite 연결
│   │   ├── init-db.js                 기능별 schema 적용·초기화
│   │   ├── auth.middleware.js         실제 인증 검증
│   │   ├── admin.middleware.js        관리자 권한 검증
│   │   ├── error.middleware.js        공통 오류 처리
│   │   └── audit.service.js           변경 이력 기록
│   └── contracts/
│       ├── api-contract.md            기능 간 호출 규약
│       ├── database-schema.md         테이블·컬럼·외래 키
│       └── status-definitions.md      신고·인계·보관 상태값
│
├── features/
│   ├── account/                       [A] 인증·알림·사용자 관리
│   │   ├── frontend/
│   │   │   ├── login.html
│   │   │   ├── signup.html
│   │   │   ├── notifications.html
│   │   │   ├── admin-users.html
│   │   │   ├── css/
│   │   │   │   └── account.css
│   │   │   └── js/
│   │   │       ├── login.js
│   │   │       ├── signup.js
│   │   │       ├── notifications.js
│   │   │       └── admin-users.js
│   │   ├── backend/
│   │   │   ├── index.js                 /api/account 라우터
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.repository.js
│   │   │   ├── notification.controller.js
│   │   │   ├── notification.service.js
│   │   │   ├── notification.repository.js
│   │   │   ├── user-admin.controller.js
│   │   │   ├── user-admin.service.js
│   │   │   └── user-admin.repository.js
│   │   ├── account.schema.sql
│   │   └── account.test.js
│   │
│   ├── reports/                       [B] 분실·습득 신고
│   │   ├── frontend/
│   │   │   ├── lost-report.html
│   │   │   ├── found-report.html
│   │   │   ├── my-reports.html
│   │   │   ├── report-edit.html
│   │   │   ├── admin-reports.html
│   │   │   ├── css/
│   │   │   │   └── reports.css
│   │   │   └── js/
│   │   │       ├── lost-report.js
│   │   │       ├── found-report.js
│   │   │       ├── my-reports.js
│   │   │       ├── report-edit.js
│   │   │       └── admin-reports.js
│   │   ├── backend/
│   │   │   ├── index.js                 /api/reports 라우터
│   │   │   ├── report.controller.js
│   │   │   ├── report.service.js
│   │   │   ├── report.repository.js
│   │   │   └── photo-upload.js
│   │   ├── reports.schema.sql
│   │   └── reports.test.js
│   │
│   ├── discovery/                     [C] 메인·검색·매칭·통계
│   │   ├── frontend/
│   │   │   ├── index.html
│   │   │   ├── search.html
│   │   │   ├── report-detail.html
│   │   │   ├── matches.html
│   │   │   ├── admin-matches.html
│   │   │   ├── admin-stats.html
│   │   │   ├── css/
│   │   │   │   └── discovery.css
│   │   │   ├── js/
│   │   │   │   ├── index.js
│   │   │   │   ├── search.js
│   │   │   │   ├── report-detail.js
│   │   │   │   ├── matches.js
│   │   │   │   ├── admin-matches.js
│   │   │   │   └── admin-stats.js
│   │   │   └── assets/
│   │   │       ├── wallet-lost.jpg
│   │   │       └── wallet-found.jpg
│   │   ├── backend/
│   │   │   ├── index.js                 /api/discovery 라우터
│   │   │   ├── search.controller.js
│   │   │   ├── search.service.js
│   │   │   ├── matching.controller.js
│   │   │   ├── matching.service.js
│   │   │   ├── matching.repository.js
│   │   │   ├── stats.controller.js
│   │   │   └── stats.service.js
│   │   ├── matching.schema.sql
│   │   └── discovery.test.js
│   │
│   └── operations/                    [D] 인계·보관·폐기
│       ├── frontend/
│       │   ├── handover-apply.html
│       │   ├── handover-status.html
│       │   ├── admin-handovers.html
│       │   ├── admin-handover-detail.html
│       │   ├── admin-storage.html
│       │   ├── css/
│       │   │   └── operations.css
│       │   └── js/
│       │       ├── handover-apply.js
│       │       ├── handover-status.js
│       │       ├── admin-handovers.js
│       │       ├── admin-handover-detail.js
│       │       └── admin-storage.js
│       ├── backend/
│       │   ├── index.js                 /api/operations 라우터
│       │   ├── handover.controller.js
│       │   ├── handover.service.js
│       │   ├── handover.repository.js
│       │   ├── storage.controller.js
│       │   ├── storage.service.js
│       │   ├── storage.repository.js
│       │   └── retention.job.js
│       ├── operations.schema.sql
│       └── operations.test.js
│
├── database/
│   └── lostfound.db                    실행 시 로컬 생성·Git 제외
│
├── docs/README.md                    현재 A 구현 요약·팀원 사용법
└── docs_A/                           기존 자료 보관
    ├── 기능명세서.pdf
    ├── useCaseDiagram.drawio
    ├── sequenceDiagram.drawio          원본 개선본 파일을 이 이름으로 복사 시
    ├── meeting-notes/
    └── decisions.md                    인터페이스·설계 결정 기록
```

### 파일명 해석

| 유형 | 목적 |
|---|---|
| `*.html` | 해당 기능의 실제 웹 페이지 |
| `*.css` | 담당 영역의 스타일 (공통 스타일은 `shared/frontend/css/`) |
| `frontend/js/*.js` | 화면 이벤트·입력 검증·API 호출 |
| `backend/index.js` | 담당 기능의 Express Router를 내보내는 시작점 |
| `*.controller.js` | HTTP 요청·응답 처리 |
| `*.service.js` | 비즈니스 규칙·상태 전이 |
| `*.repository.js` | SQL 조회·저장·수정 |
| `*.schema.sql` | 해당 담당자가 소유하는 테이블 정의 |
| `*.test.js` | 해당 기능 테스트 |

> 기능이 단순하면 `controller/service/repository`를 꼭 모두 분리할 필요는 없다. 단, **개발 전에 팀이 파일 책임 규칙을 통일**해야 한다.

## 4. 페이지별 정확한 담당 기능

### A — `features/account/` (4페이지)

| 페이지 | 반드시 구현할 동작 |
|---|---|
| `login.html` | 아이디/비밀번호 로그인·로그아웃·오류 표시 |
| `signup.html` | 회원가입, 중복 검사, 입력값 검증 |
| `notifications.html` | 유사 물품 알림, 인계 변경 알림 목록·읽음 처리 |
| `admin-users.html` | 사용자 목록, 악성·부적절 사용자 확인, 신고 제한 |

- 백엔드: 계정 생성, 인증, 사용자 식별, 로그인 유지, 사용자 권한, 알림 기록·발송 트리거, 관리자 사용자 제한.
- 공통 작업: Express 서버, DB 연결/초기화, 공통 인증 미들웨어, 네비게이션·공통 디자인, 공통 API 헬퍼, 공통 변경 이력.
- 주의: A에게 공통 기반 작업이 추가로 집중되므로 **초기 공통 구조를 먼저 완성**하고 나머지 팀원들이 독립 작업을 시작하도록 한다.

### B — `features/reports/` (5페이지)

| 페이지 | 반드시 구현할 동작 |
|---|---|
| `lost-report.html` | 분실물 이름·카테고리·장소·날짜/시간·특징·사진 입력 및 저장 |
| `found-report.html` | 습득물 정보·보관 장소·사진 입력 및 저장 |
| `my-reports.html` | 내가 작성한 분실·습득 신고 목록·현재 상태 |
| `report-edit.html` | 본인 신고 수정·삭제 |
| `admin-reports.html` | 신고 검색·관리·상태 변경·중복/잘못된 신고 처리·관리자 습득물 직접 등록 |

- 백엔드: 신고 CRUD, 사진 서버 저장/연결, 작성자별 접근 제한, 관리자 신고 관리.
- 신고 데이터 구조는 C의 검색·매칭과 D의 인계 신청이 사용하므로 **B가 가장 먼저 컬럼을 제안하고 전원이 합의**한다.

### C — `features/discovery/` (6페이지)

| 페이지 | 반드시 구현할 동작 |
|---|---|
| `index.html` | 서비스 메인, 최근 습득물, 주요 기능 이동 |
| `search.html` | 분실/습득 양방향 검색, 이름·카테고리·장소·날짜·상태 필터 |
| `report-detail.html` | 선택한 신고 상세 조회·관련 기능 이동 |
| `matches.html` | 유사 신고 추천 결과, 비교 근거 표시 |
| `admin-matches.html` | 매칭 후보 검토·확정·해제/거절 |
| `admin-stats.html` | 기간별·종류별 신고 건수, 인계 완료율, 미처리 건수 |

- 백엔드: 필터 검색, 유사 신고 비교 및 점수/근거 계산, 매칭 관리, 통계 집계.
- **정적 예시 매칭 결과를 실제 알고리즘이라고 표현하지 말 것.** 초기 버전은 이름·카테고리·장소·날짜 비교에 기반한 규칙 매칭으로 구현할 수 있다(제안).

### D — `features/operations/` (5페이지)

| 페이지                          | 반드시 구현할 동작                            |
| ---------------------------- | ------------------------------------- |
| `handover-apply.html`        | 습득물에 대한 인계 신청, 본인 확인용 추가 특징 입력        |
| `handover-status.html`       | 내 신청 목록·신청/확인 중/승인/거절/인계 완료 상태 조회     |
| `admin-handovers.html`       | 관리자 인계 요청 접수·조회                       |
| `admin-handover-detail.html` | 소유자 검증, 승인·거절, 인계 완료 일시·대상자 기록        |
| `admin-storage.html`         | 물품 보관 상태·기한 확인, 보관 기간 임박/초과, 폐기·이관 처리 |
|                              |                                       |

- 백엔드: 인계 요청, 승인/거절/완료 상태 전이, 실물 인계 기록, 보관 기간 계산·알림·폐기 이력.
- **인계 신청과 인계 완료는 다른 사건**이다. 관리자가 신청을 승인했다고 곧바로 인계 완료로 바꾸지 않는다.

## 5. 기존 UI 압축파일의 이전 계획

현재 압축파일에서 확인되는 핵심 파일은 `index.html`, `login.html`, `report.html`, `styles.css`, `app.js`, 이미지 자산, `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `README.md` 등이다.

| 기존 파일 | 새 위치 / 조치 | 담당 |
|---|---|---|
| `index.html` | `features/discovery/frontend/index.html`로 이동 | C |
| `login.html` | `features/account/frontend/login.html`로 이동 | A |
| `report.html` | `features/reports/frontend/lost-report.html`로 이동 | B |
| `styles.css` | `base.css`, `components.css`, 각 기능별 CSS로 **규칙을 나누어 이관** | A 총괄, 영역별 담당 |
| `app.js` | 로그인·알림(A), 신고(B), 메인·검색·매칭(C) 등으로 **이벤트 핸들러를 나누어 이관** | A/B/C |
| `assets/wallet-lost.jpg` | `features/discovery/frontend/assets/wallet-lost.jpg` | C |
| `assets/wallet-found.jpg` | `features/discovery/frontend/assets/wallet-found.jpg` | C |
| `favicon.svg` / `public/favicon.svg` | 공통 공개 정적 자산으로 통합 | A |
| `package.json` | Express 서버 중심 스크립트로 수정(기존 Vite 유지 여부 합의) | A |
| `pnpm-lock.yaml` | npm 도입 시 제거 후 `package-lock.json` 사용; pnpm 유지 시 그대로 유지 | A |
| `vite.config.ts`, `tsconfig.json`, `src/vite-env.d.ts` | Vite를 유지하면 보존, 사용하지 않으면 제거 | A |
| `.figma/`, `AGENTS.md`, `CLAUDE.md` | 배포용 실행 필수 파일이 아니므로 필요성 확인 후 보존/정리 | A |

**이전 작업에서 주의할 점**

1. HTML의 `<link href>` / `<script src>` 경로를 이동 후에 수정한다.
2. `window.location.href` 등 페이지 링크를 새 URL에 맞춘다.
3. 기존 `app.js`에서 로그인 성공 표시, 신고 접수 안내, 검색 예시 데이터가 **실제 서버 저장/인증을 의미하지 않는 부분**은 새 백엔드 로직으로 교체한다.
4. 기존 고정 예시 데이터를 실제 DB 연동으로 대체하거나, 데모 데이터임을 명확히 표시한다.

## 6. 공통 URL·API 규칙 (제안)

### 프론트엔드 URL

| URL 접두사 | 공개할 파일 폴더 | 소유자 |
|---|---|---|
| `/account/` | `features/account/frontend/` | A |
| `/reports/` | `features/reports/frontend/` | B |
| `/discovery/` | `features/discovery/frontend/` | C |
| `/operations/` | `features/operations/frontend/` | D |
| `/shared/` | `shared/frontend/` | A |

- `/` 접속 시 `/discovery/index.html`로 이동시키는 방식 추천.
- 서버는 **오직 `frontend/` 폴더들만 정적 공개**한다. `backend/`, `.env`, SQLite DB, SQL 파일을 공개하면 안 된다.
- 관리자용 HTML 파일을 숨기는 것만으로는 보안이 확보되지 않는다. **관리자 API마다 서버에서 권한 검사**를 수행해야 한다.

### 백엔드 API 접두사

| 접두사 | 소유자 | 예시 엔드포인트 |
|---|---|---|
| `/api/account` | A | `POST /login`, `POST /signup`, `GET /me`, `GET /notifications` |
| `/api/reports` | B | `POST /`, `GET /mine`, `PATCH /:id`, `DELETE /:id` |
| `/api/discovery` | C | `GET /search`, `GET /matches`, `GET /stats` |
| `/api/operations` | D | `POST /handovers`, `GET /handovers/mine`, `PATCH /handovers/:id/status` |

위 표의 URL은 예시이며, 구현하기 전에 `shared/contracts/api-contract.md`에 **메서드·경로·요청 JSON·응답 JSON·오류 코드**를 확정한다.

## 7. 데이터 및 상태값 설계 규칙

### 테이블 소유권

- **A**: `users`, `notifications`, `audit_logs`
- **B**: `reports`, `report_photos`
- **C**: `matches`
- **D**: `handover_requests`, `storage_records`

`reports`는 분실/습득 신고를 `type` 등으로 구분하는 통합 테이블을 권장하지만, 최종 컬럼과 외래 키는 전원 합의 후 확정한다. 한 팀원이 다른 사람 테이블을 임의로 수정하지 않는다.

### 상태 체계는 반드시 구분

| 대상 | 별도 상태값이 필요한 이유 | 상태 예시 |
|---|---|---|
| 신고/물품 | 접수·보관·매칭·인계·폐기 진행 | `REPORTED`, `RECEIVED`, `STORED`, `MATCHED`, `HANDOVER_IN_PROGRESS`, `HANDED_OVER`, `DISPOSED` |
| 인계 신청 | 신청 심사와 실제 전달은 별개 | `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `COMPLETED` |

상태명은 **예시**다. 기능 명세서에 있는 한국어 상태(신고됨, 접수됨, 보관 중, 매칭됨, 인계 진행 중, 인계 완료, 폐기 / 신청→확인 중→승인→인계 완료)를 기반으로 팀이 영문 코드값을 정한다. 필요하면 `TRANSFERRED` 등 이관 상태를 별도로 추가한다.

## 8. 협업 규칙 — 자기 파일만 수정하기

1. A는 `shared/` 및 루트 설정 파일을 관리한다. **공통 코드 변경 요청은 이슈/메시지로 A에게 전달**한다.
2. B/C/D는 각자 자신의 `features/<담당>/` 파일만 직접 수정한다.
3. API·DB·상태값 변경 시 `shared/contracts/` 내용을 먼저 합의하고, 담당 소유자가 문서를 갱신한다.
4. 한 사람이 다른 사람 기능이 필요하면 **함수/데이터를 복사해 구현하지 말고 API를 호출**한다.
5. 개인 브랜치로 작업한 뒤 PR을 통해 합친다. 예: `feature/account`, `feature/reports`, `feature/discovery`, `feature/operations`.
6. Git에는 `.env`, 실제 DB(`*.db`), 의존성 설치 폴더(`node_modules/`), 사용자 업로드 원본(운영 데이터)을 포함하지 않는다.
7. 각자 자신이 맡은 화면에서 **HTML + CSS + JavaScript가 실제로 사용**되는지 확인한다.
8. 브랜치가 분리돼 있어도 DB 인터페이스와 공통 CSS를 합의 없이 변경하면 충돌한다는 점에 유의한다.

## 9. 개발 순서 및 선행 의존성

### 0단계 — 팀 전체가 먼저 확정

- [ ] A/B/C/D 실제 담당자 이름 지정
- [ ] 백엔드 스택 확정 (현재 제안: Express + SQLite)
- [ ] 20개 화면의 필요 여부 및 명세서 기능 누락 확인
- [ ] `reports` 중심 데이터 스키마·외래 키 확정 (**B 초안 작성**)
- [ ] 로그인·관리자 권한 기준 확정 (**A 초안 작성**)
- [ ] API 계약 및 상태값 확정 (**전원 합의**)
- [ ] `shared/` 소유자·PR 승인 규칙 확정

### 1단계 — 공통 골격 준비 (A 중심)

- [x] `package.json`·Express 서버 실행
- [x] 기능별 라우터 등록 및 정적 페이지 URL 연결
- [x] SQLite DB 연결·테이블 초기화
- [x] 공통 CSS·헤더·API 헬퍼
- [x] 인증·권한 미들웨어 기본 동작

### 2단계 — 담당자별 병렬 개발

- [x] **A**: 로그인 → 회원가입 → 알림 → 관리자 사용자 관리
- [ ] **B**: 분실 신고 → 습득 신고 → 내 신고 → 수정/삭제 → 관리자 신고 관리
- [ ] **C**: 메인 → 검색/필터 → 상세 → 매칭 → 관리자 매칭 → 통계
- [ ] **D**: 인계 신청 → 상태 조회 → 관리자 승인/거절/완료 → 보관/폐기

### 3단계 — 통합 테스트 (전원)

- [ ] 회원가입 → 로그인 → 분실 신고 등록
- [ ] 습득 신고 등록 → 검색 → 유사 물품 매칭
- [ ] 인계 신청 → 관리자 검증/승인 → 인계 완료
- [ ] 알림 생성·조회 및 처리 이력 기록
- [ ] 관리자만 관리자 API 접근 가능
- [ ] 본인 신고만 수정/삭제 가능 (관리자 예외 정책 별도)
- [ ] 사진 저장/조회 및 파일 형식·크기 검증
- [ ] 보관 기한 경과·폐기 처리
- [ ] 모바일/데스크톱 화면, 링크, 예외 메시지 확인

## 10. 과제 문서와의 연결

업로드된 「팀 프로젝트 수행 방법」 문서 기준으로 다음 산출물도 함께 챙긴다.

- 기능별 웹 화면을 설계하고 팀원별 역할을 명시한 **프로젝트 보고서(PPT)**
- 팀원별 최소 1개 웹 화면 구현
- HTML·CSS·JavaScript 사용
- 정해진 양식에 따른 **회의록 10회**
- 통합 테스트 및 **5분 이내 시연 영상**
- **문서에 기재된 일정**: 시스템 구현 2026-11-27(금) 21:00, 최종 산출물 2026-12-04(금) 21:00

> **최종 핵심**: A가 공통 기반과 계정을 맡고, B는 신고, C는 검색/매칭/통계, D는 인계/보관을 맡는다. 모든 팀원은 자기 폴더 내에서 HTML/CSS/JS/백엔드 구현을 완료한다. 공통 DB·API·상태값만 최초에 합의하고 이후에는 소유자 중심으로 변경한다.

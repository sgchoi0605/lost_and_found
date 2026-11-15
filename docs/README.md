# A 구현 안내

**담당: A 최성규 · 기준: 2026-11-15**

역할분담 문서의 **1단계 공통 기반과 2단계 A**를 구현했습니다. 기존 설계 자료·상세 기록·검증 이미지는 [docs_A](../docs_A/)에 보관합니다. 팀원은 이 문서를 먼저 읽고, 요청·응답의 상세 형식이 필요할 때 [API 계약](../shared/contracts/api-contract.md)을 확인하세요.

## 1. 어디까지 구현했나요?

| 완료 기능 | 하는 일 |
| --- | --- |
| 공통 서버·DB | 화면과 API 제공, SQLite 연결·테이블 초기화 |
| 회원가입·로그인 | 입력·중복 검사, 비밀번호 해시 저장, 로그인 유지·로그아웃 |
| 알림 | 내 알림 조회, 개별·전체 읽음, C/D가 사용할 알림 생성 함수 |
| 사용자 관리 | 관리자 검색, 신고 제한·해제, 종료일·변경 사유 기록 |
| 공통 도구 | 계정 메뉴, API 호출, 로그인·관리자 검사, 오류 안내 |

B의 신고, C의 검색·매칭·통계, D의 인계·보관 기능은 각 담당자가 구현해야 합니다. 매칭·인계 알림은 C/D가 생성 함수를 연결해야 발생합니다.

## 2. A 파일은 어디에 있나요?

```text
Lost_and_Found/
├── package.json                      실행·테스트 명령, 패키지 목록
├── pnpm-lock.yaml                    팀이 같은 패키지 버전을 설치하도록 고정
├── .env.example                      서버 주소·포트·DB 경로 설정 예시
├── .gitignore                        DB·환경 파일·설치 폴더를 Git에서 제외
├── vite.config.ts                    개발 API 프록시·화면 빌드 설정
├── index.html                        메인으로 이동하는 시작 페이지
├── README.md                         실행 방법·현재 진행 상태
├── AGENTS.md                         코드 수정 시 지킬 프로젝트 규칙
├── public/favicon.svg                공통 사이트 아이콘
├── shared/                           A가 관리하는 공통 코드
│   ├── backend/
│   │   ├── server.js                 서버 시작·기능별 API와 화면 연결
│   │   ├── database.js               SQLite 연결
│   │   ├── init-db.js                테이블 생성·DB 버전 준비
│   │   ├── auth.middleware.js        로그인 확인·신고 제한 검사
│   │   ├── admin.middleware.js       관리자 권한 검사
│   │   ├── request.middleware.js     요청 출처·JSON 형식 검사
│   │   ├── error.middleware.js       공통 오류 응답
│   │   ├── audit.service.js          변경 이력·DB 작업 묶기
│   │   ├── database.test.js          DB 검증
│   │   └── server.test.js            서버·경로 검증
│   ├── frontend/
│   │   ├── css/
│   │   │   ├── base.css              공통 색상·글꼴·기본 스타일
│   │   │   └── components.css        공통 메뉴·버튼·폼 스타일
│   │   └── js/
│   │       ├── api.js                API 요청·오류 처리
│   │       ├── layout.js             계정 메뉴·로그아웃·메인 알림 연결
│   │       ├── auth-guard.js         화면의 로그인·관리자 확인
│   │       ├── toast.js              잠깐 표시하는 안내 메시지
│   │       └── unimplemented.js      미구현 버튼 안내
│   └── contracts/
│       ├── api-contract.md           API 주소·요청·응답·오류
│       ├── database-schema.md        테이블·컬럼·관계
│       └── status-definitions.md     권한·제한·업무 상태값
├── features/
│   ├── account/                      A의 계정 기능
│   │   ├── frontend/
│   │   │   ├── login.html            로그인 화면
│   │   │   ├── signup.html           가입 화면
│   │   │   ├── notifications.html    내 알림 화면
│   │   │   ├── admin-users.html      관리자 사용자 화면
│   │   │   ├── css/account.css       네 화면의 전용 스타일
│   │   │   └── js/
│   │   │       ├── account-ui.js     계정 화면의 공통 폼·메시지 도구
│   │   │       ├── login.js          로그인 입력·전송
│   │   │       ├── signup.js         가입 입력·전송
│   │   │       ├── notifications.js  알림 목록·읽음 버튼
│   │   │       └── admin-users.js    사용자 목록·제한 폼
│   │   ├── backend/
│   │   │   ├── index.js             계정 API 주소 연결
│   │   │   ├── account.validation.js 입력값 검사
│   │   │   ├── admin.cli.js         터미널에서 관리자 지정
│   │   │   ├── auth.controller.js    가입·로그인 요청·쿠키 응답
│   │   │   ├── auth.service.js       가입·비밀번호·세션 처리 규칙
│   │   │   ├── auth.repository.js    회원 조회·응답 정보 정리
│   │   │   ├── notification.controller.js 알림 요청·응답
│   │   │   ├── notification.service.js    알림 생성·조회·읽음 규칙
│   │   │   ├── notification.repository.js 알림 저장·조회 SQL
│   │   │   ├── user-admin.controller.js   사용자 관리 요청·응답
│   │   │   ├── user-admin.service.js      검색·신고 제한 규칙
│   │   │   └── user-admin.repository.js   사용자 검색 SQL
│   │   ├── account.schema.sql       사용자·알림·이력·세션 테이블
│   │   └── account.test.js          계정 기능 검증
│   ├── reports/                     B 작업 폴더
│   ├── discovery/                   C 작업 폴더
│   └── operations/                  D 작업 폴더
├── database/lostfound.db             로컬 DB 파일, Git 제외
├── docs/README.md                    현재 팀원용 요약 (이 문서)
└── docs_A/                          이전 문서·명세·다이어그램·작업 기록
```

B/C/D의 SQL 파일은 각 기능 폴더에 있으며, 공통 init-db.js가 함께 읽습니다.

### 파일 이름을 읽는 방법

| 종류 | 역할 |
| --- | --- |
| HTML / CSS / frontend JS | 화면 구조 / 모양 / 클릭·입력·API 호출 |
| backend/index.js | API 주소에 처리 함수를 연결 |
| controller | HTTP 요청을 받고 결과를 응답 |
| service | 입력·권한 외의 업무 규칙 처리 |
| repository | SQL로 DB 조회·저장 |
| middleware | 실제 처리 전에 로그인·권한 등을 검사 |
| schema.sql / test.js | 테이블 정의 / 정상·오류 동작 검증 |

가입 흐름 예: `signup.html → signup.js → api.js → 계정 index.js → controller → service → users 테이블`. 로그인 조회 등은 repository를 사용합니다. service가 직접 SQL을 실행하는 부분도 있습니다.

## 3. 먼저 실행하기

Node.js 22.13 이상에서 프로젝트 폴더의 터미널로 실행합니다.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:init
corepack pnpm start
```

http://127.0.0.1:3000 접속 → 회원가입 → 로그인. 관리자는 가입 후 `corepack pnpm admin:promote 본인아이디`로 지정합니다. 화면은 `/account/login.html`, `/account/signup.html`, `/account/notifications.html`, `/account/admin-users.html`입니다.

개발 시 Express를 켜 둔 채 별도 터미널에서 `corepack pnpm dev`를 실행합니다. Vite에서는 `/features/account/frontend/login.html`처럼 긴 경로를 씁니다. `/api` 요청은 Express 3000 포트로 전달됩니다.

DB는 기본 `database/lostfound.db`입니다. DB Browser for SQLite의 **데이터 보기 → users**에서 회원을 확인합니다. `.env`의 DATABASE_PATH를 바꿨다면 그 파일을 열어야 합니다. 테이블은 업무 8개 + 로그인용 sessions, 총 9개입니다.

## 4. 각자 어떻게 이어서 작업하나요?

### 공통: 내 폴더에서 화면과 API 만들기

각자 `features/<담당>/frontend`와 `backend`에서 작업합니다. 공통 코드·테이블 변경은 A와 조율합니다. 새 API 주소와 데이터 형식은 shared/contracts에도 반영합니다.

화면 JS에서 공통 API 함수를 사용하세요. 아래 `/api/reports`는 **B가 구현할 API 예시**이며 아직 신고 저장은 제공하지 않습니다.

```js
import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';

const user = await requireUser();
if (user) {
  const report = await api('/api/reports', {
    method: 'POST',
    body: { itemName: '지갑' }, // 실제 필드는 B가 정한 API 계약에 맞춤
  });
}
```

api는 로그인 쿠키를 함께 보내고 성공 응답의 data만 반환합니다. 오류는 try/catch로 받아 화면에 표시하세요. 화면 가드만으로 API를 보호할 수는 없으므로 아래 서버 검사도 필요합니다.

### B: 신고 API에 인증과 신고 제한 연결

`features/reports/backend/index.js` 기준입니다. 공통 서버가 req.db를 준비하고, requireAuth가 req.user를 채웁니다.

```js
import { requireAuth, requireCanReport } from '../../../shared/backend/auth.middleware.js';
import { requireAdmin } from '../../../shared/backend/admin.middleware.js';

router.post('/', requireAuth, requireCanReport, createReport);
router.get('/admin', requireAuth, requireAdmin, listAdminReports);
```

createReport·listAdminReports는 B가 만드는 처리 함수입니다. 작성자 ID는 body가 아니라 **req.user.user_id**를 사용합니다. 수정·삭제는 신고 작성자와 로그인 사용자가 같은지도 확인해야 합니다. 사진 업로드는 현재 공통 API의 JSON 제한과 별도 조율이 필요합니다.

### C·D: 업무 처리 후 실제 알림 생성

각 기능의 `backend` JS에서 가져옵니다. C는 MATCH, D는 HANDOVER·EXPIRY를 사용합니다. 알림을 임의로 만드는 공개 API는 없습니다.

```js
import { createNotification } from '../../account/backend/notification.service.js';

createNotification(req.db, {
  userId: recipientUserId, // 업무 데이터에서 정한 실제 수신자 ID
  type: 'HANDOVER',
  message: '인계 신청이 승인되었습니다.',
  targetPath: '/features/operations/frontend/handover-status.html',
});
```

업무 SQL과 알림을 함께 성공·취소하려면 audit.service.js의 transaction으로 묶으세요. 콜백에는 **동기 DB 작업만** 넣고, 이미 열린 트랜잭션 안에서는 다시 transaction을 호출하지 않습니다. [상세 예제](../docs_A/A_구현완료_연동가이드.md)를 참고하세요.

## 5. 작업을 마친 뒤 확인하기

```sh
corepack pnpm test
corepack pnpm build
```

A 기준 자동 테스트 22개와 전체 화면 빌드를 검증했습니다. 가입·로그인·알림 읽음·사용자 제한은 Chrome과 모바일 크기에서도 확인했습니다. 기존 증거는 [작업 기록](../docs_A/work-logs/2026-11-15-A-2단계-완료.md)에 있습니다.

다음은 B/C/D의 실제 기능 구현과 전원 통합 테스트입니다. 아이디 찾기·비밀번호 재설정·메일/푸시 발송은 이번 A 필수 범위에 포함되지 않습니다.

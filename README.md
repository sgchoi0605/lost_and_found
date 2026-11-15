# Lost & Found

정적 HTML/CSS/JavaScript + Vite + Express + SQLite 팀 프로젝트입니다.

**2026-11-15: 역할분담 문서의 1단계 공통 기반과 2단계 A(최성규)의 로그인·회원가입·알림·관리자 사용자 관리를 구현했습니다.** B/C/D 업무 기능과 3단계 전체 통합 테스트는 남아 있습니다.

먼저 [A 구현·팀원 사용 안내](docs/README.md)를 읽어주세요. API 사용법, 관리자 지정, C/D의 알림 생성 예제가 있습니다. 협업·Git 절차는 [팀원 작업 가이드](팀원_작업가이드.md), 변경과 검증 결과는 [작업 기록](docs_A/work-logs/2026-11-15-A-2단계-완료.md)에 있습니다.

## 실행

Node.js 22.13 이상. pnpm을 사용하고 npm install과 혼용하지 않습니다.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:init
corepack pnpm start
```

http://127.0.0.1:3000 접속. pnpm이 이미 설치돼 있으면 corepack을 생략할 수 있습니다.

- 가입: `/account/signup.html`, 로그인: `/account/login.html`
- 내 알림: `/account/notifications.html`, 사용자 관리: `/account/admin-users.html`
- 관리자 지정: 먼저 가입한 뒤 `corepack pnpm admin:promote 가입한아이디`
- 일반 회원의 관리자 API 접근은 서버에서 거부합니다. 기본 관리자·공용 비밀번호는 없습니다.
- `.env.example`을 `.env`로 복사하면 HOST·PORT·DATABASE_PATH를 설정할 수 있습니다.

## 개발·검증

| 명령 | 용도 |
|---|---|
| `corepack pnpm dev:server` | Express 자동 재시작 (기본 3000) |
| `corepack pnpm dev` | Vite 개발 서버. 별도 Express 실행 필요, `/api`를 3000으로 프록시 |
| `corepack pnpm build` | 20개 화면 Vite 빌드 |
| `corepack pnpm test` | DB·서버·A 계정 테스트 전체 |
| `corepack pnpm test:account` | 계정 API·권한·알림·세션 테스트 |
| `corepack pnpm test:server` | 정적 경로·비공개 파일 보호·라우터 테스트 |
| `corepack pnpm test:db` | DB 초기화·제약·저장 테스트 |

Express는 `/<기능>/<화면>.html`과 `/features/<기능>/frontend/<화면>.html`을 모두 지원합니다. Vite는 긴 경로를 사용하세요. HTML 직접 열기와 dist만 정적 배포하는 방식으로는 인증·DB API가 실행되지 않습니다. preview는 빌드 화면 확인용이며 API 프록시는 제공하지 않습니다.

## 담당·폴더

| 역할 / 브랜치 | 소유 범위 | 현재 상태 |
|---|---|---|
| A / A | features/account, shared, 루트 설정·문서 | 공통 기반 및 2단계 A 완료 |
| B / B | features/reports | 화면 골격·DB·health, 업무 API 구현 필요 |
| C / C | features/discovery | UI 초안·DB·health, 실제 검색/매칭/통계 구현 필요 |
| D / D | features/operations | 화면 골격·DB·health, 업무 API 구현 필요 |

공통 파일·스키마 변경은 A와 조율하고 담당 브랜치에서 작업 후 main으로 PR을 제출합니다. 기존 원본 UI는 상위 Lost and Found Management UI 폴더에 보관합니다.

## DB·연동 계약

Node 내장 node:sqlite를 사용합니다. db:init은 기존 8개 업무 테이블과 로그인용 sessions를 생성하고 **DB 버전 2**로 기록합니다. 기존 버전 1 DB는 데이터를 보존한 채 sessions를 추가합니다. 테스트 계정·예시 알림은 자동 삽입하지 않습니다.

서버는 첫 사용 시 DB에 연결하므로 실행 전에 db:init이 필요합니다. 인증은 7일 만료의 DB 세션·HttpOnly 쿠키를 사용합니다. 사용자 소유권·관리자 권한을 서버에서 검사합니다.

- [API 요청·응답·오류 계약](shared/contracts/api-contract.md)
- [DB 테이블·버전](shared/contracts/database-schema.md)
- [상태값·권한·신고 제한](shared/contracts/status-definitions.md)
- [A 완료·B/C/D 연동 예제](docs/README.md)

알림 생성 함수는 구현했지만 매칭·인계 사건의 호출은 C/D가 연결해야 합니다. 신고 제한 가드도 B의 신고 등록 API에 적용해야 합니다. 물품 예시 카드는 여전히 데모이며 실제 검색 결과가 아닙니다.

서버는 frontend·public만 공개하며 backend·SQL·환경 파일·DB는 공개하지 않습니다. .env, 실제 DB, node_modules, 업로드 원본은 Git에서 제외합니다.

문서 안내: 새 `docs/README.md`는 팀원용 요약이며 기존 상세 문서·명세·다이어그램·검증 이미지는 `docs_A/`에 보관합니다.

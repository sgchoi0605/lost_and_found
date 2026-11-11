# Lost & Found

처음 참여한 팀원은 [팀원 작업 가이드](팀원_작업가이드.md)를 먼저 읽어주세요. 담당 화면, 실행 방법, GitHub 업로드·PR 절차를 정리했습니다.
전체 파일 목록은 [폴더 구조](docs/폴더구조.md), 설계안과 현재 상태의 차이는 [검토 기록](docs/구조_검토결과.md)에 있습니다.

역할분담 문서에 따른 기능별 협업 골격입니다. Express 정적 서버·라우터와 SQLite 연결·8개 테이블 초기화를 구현했습니다. 실제 인증·신고 저장 등 업무 API와 화면의 DB 연동은 아직 구현하지 않았습니다.

## 실행

Node.js 22.13 이상에서 pnpm install 후 pnpm dev로 실행합니다. 빌드는 pnpm build입니다.
루트 index.html은 메인 화면으로 이동합니다. 정적 파일을 직접 열어서는 모듈 JS가 실행되지 않으므로 Vite 또는 Express를 사용하세요.

## 담당 및 브랜치

| 브랜치 | 담당 폴더 |
|---|---|
| A | features/account, shared, 루트 설정 |
| B | features/reports |
| C | features/discovery |
| D | features/operations |

각 브랜치는 전체 파일을 포함합니다. git switch A (또는 B/C/D)로 전환하고 담당 폴더에서 작업한 뒤 main으로 PR을 제출합니다.
공통 변경은 A와 협의합니다. 브랜치 자체가 폴더 접근을 제한하지는 않습니다.

## 구조

- features/*/frontend: 20개 HTML 화면 및 각 CSS/JS
- features/*/backend: 연결 확인용 라우터 및 미구현 서비스·저장소
- shared/frontend: 공통 스타일과 UI 도구
- shared/backend: Express 서버 및 미구현 인증·권한 미들웨어
- shared/contracts: API·DB·상태 합의 문서
- database: db:init으로 로컬 DB 생성, 실제 DB는 Git 제외
- docs: 설계 결정·명세·다이어그램·회의록

기존 3개 화면은 이전했으며 나머지 화면은 구현 예정 표시입니다. 기존 데이터는 예시이며 로그인·신고는 저장하지 않습니다.
Vite URL은 /features/<기능>/frontend/<화면>.html입니다. Express에서는 /<기능>/<화면>.html과 기존 URL을 모두 지원합니다.
pnpm-lock.yaml을 유지하므로 package-lock.json은 만들지 않습니다.
Vite 개발 서버는 로컬 개발 용도입니다. Express는 frontend와 public 디렉터리만 공개합니다. 인증은 다음 단계에서 구현합니다.

## Express 서버 (3단계)

- 설치: `pnpm install` (pnpm 명령이 없으면 `corepack pnpm` 사용)
- 실행: `pnpm start`, 수정 시 재시작: `pnpm dev:server`
- 기본 주소: http://127.0.0.1:3000 → `/discovery/index.html`
- 로그인 화면: http://127.0.0.1:3000/account/login.html
- 연결 확인: `/api/account/health`, `/api/reports/health`, `/api/discovery/health`, `/api/operations/health`
- 응답 예시: `{"feature":"account","status":"ok","stage":"routing-only"}`
- 위 응답은 라우터 연결만 확인합니다. DB·인증·저장 성공을 뜻하지 않습니다.
- 검증: `pnpm test:server`, 기존 Vite 빌드: `pnpm build`

`pnpm dev`는 기존 Vite 개발 서버입니다. Express는 별도 터미널에서 실행하며 API 연결 확인은 3000 포트에서 합니다.
필요하면 `.env.example`을 `.env`로 복사하여 `HOST`와 `PORT`를 변경합니다.
Express는 `/account/`, `/reports/`, `/discovery/`, `/operations/`, `/shared/`에 프론트엔드 폴더를 연결합니다.
기존 화면의 상대 모듈 경로를 위해 `/features/<기능>/frontend/`, `/shared/frontend/`, `/public/`도 제공합니다.
프로젝트 루트, backend, SQL, DB, 환경 파일은 공개하지 않습니다. 없는 화면과 API는 404 JSON을 반환합니다.

## SQLite 초기화 (4단계)

1. `pnpm install`로 의존성을 설치합니다.
2. 필요하면 `.env.example`을 `.env`로 복사하고 `DATABASE_PATH`를 설정합니다.
3. `pnpm db:init`을 실행하면 기본 경로 `database/lostfound.db`에 8개 테이블을 생성합니다.
4. `pnpm test:db`로 DB 연결·저장·제약·초기화 테스트를 실행합니다.

pnpm 명령이 없으면 `corepack pnpm db:init`, `corepack pnpm test:db`로 실행합니다.
상대 DB 경로는 프로젝트 루트 기준입니다. 초기화는 기존 데이터를 지우지 않으며 실패 시 롤백합니다.
테스트는 메모리·임시 DB를 사용하고 실제 프로젝트 DB에 샘플 데이터를 넣지 않습니다.

Node 내장 `node:sqlite`를 사용하므로 별도 DB 서버나 네이티브 패키지 설치가 필요하지 않습니다.
22.13 이상에서 별도 실행 플래그 없이 사용할 수 있으며, 현재 검증 환경(Node 24.14)에서는 ExperimentalWarning이 표시됩니다.
기능과 버전 정보는 [Node.js SQLite 문서](https://nodejs.org/api/sqlite.html)를 참고하세요.

`shared/backend/database.js`의 `openDatabase()`로 연결을 얻고 사용 후 `close()`합니다.
import나 Express 시작만으로 DB를 초기화하지 않습니다. 먼저 `db:init`을 실행하세요.
현재 `/api/*/health`는 계속 라우터 연결만 검사하며 DB 상태나 실제 로그인 성공을 뜻하지 않습니다.

설계 기준은 `Lost_and_Found_역할분담.md`이며 새 ERD는 보조 자료입니다.
사진·보관을 별도 테이블로 두고 이력 이름은 `audit_logs`로 유지합니다.
자세한 컬럼과 ERD 차이는 [DB 구현 기록](shared/contracts/database-schema.md)을 참고하세요.
5단계 API·상태 전이 계약과 6단계 인증은 아직 남아 있습니다.

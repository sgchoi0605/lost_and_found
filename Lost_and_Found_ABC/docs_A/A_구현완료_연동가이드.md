# A 구현 완료 및 팀원 연동 가이드

작성: 2026-11-15 / 담당: A 최성규 / 기준: `Lost_and_Found_역할분담.md`의 1단계 및 2단계 A.

## 이번에 완료한 일

| 범위 | 실제 동작 | 주요 위치 |
|---|---|---|
| 공통 실행 기반 | Express·SQLite·정적 페이지 URL, Vite API 프록시 | shared/backend/, vite.config.ts |
| 공통 프론트 | API 오류 처리·계정 메뉴·로그아웃·페이지 접근 가드 | shared/frontend/js/ |
| 회원가입 | 입력 검증·중복 검사·scrypt 비밀번호 해싱·USER 고정 생성 | features/account/backend/auth.* |
| 로그인 | 비밀번호 확인·HttpOnly 쿠키·DB 세션·7일 만료·로그아웃 폐기 | account/backend/, shared/backend/auth.middleware.js |
| 알림 | 본인 목록·미읽음 수·개별/전체 읽음·페이지 나누기 | account/frontend/notifications.html 및 notification.* |
| 관리자 사용자 관리 | 아이디/이름/이메일 검색·신고 제한/해제·종료일·사유 이력 | account/frontend/admin-users.html 및 user-admin.* |
| 관리자 지정 | 기존 가입 계정에 로컬 명령으로 권한 부여 | account/backend/admin.cli.js |
| 감사 이력 | 가입·로그인·로그아웃·제한·관리자 지정 기록 | shared/backend/audit.service.js |
| DB 확장 | 기존 업무 테이블 8개 유지 + sessions 추가, 버전 1→2 | account.schema.sql, shared/backend/init-db.js |

**B/C/D의 소스는 수정하지 않았습니다.** 메인에 남아 있던 A의 알림 버튼·로그인 링크는 기존 공통 `unimplemented.js`가 `layout.js`를 불러오는 방식으로 연결합니다. 메인 알림 버튼은 실제 알림 페이지로 이동하고 예시 서랍은 비웁니다. 관리자에게는 사용자 관리 링크를 표시합니다.

## 바로 실행하기

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:init
corepack pnpm start
```

브라우저에서 http://127.0.0.1:3000 을 엽니다. Node.js 22.13 이상이 필요합니다. pnpm이 PATH에 있으면 `corepack`을 생략해도 됩니다.

| 화면 | 경로 |
|---|---|
| 로그인 | `/account/login.html` |
| 회원가입 | `/account/signup.html` |
| 내 알림 | `/account/notifications.html` |
| 관리자 사용자 관리 | `/account/admin-users.html` |

긴 URL `/features/account/frontend/...`도 지원합니다. Express는 소스 frontend 폴더를 제공합니다. `pnpm build`는 Vite 빌드 검증이며 dist만 정적 배포하면 인증 API가 실행되지 않습니다.

개발 중에는 Express를 켜 둔 상태에서 별도 터미널로 `corepack pnpm dev`를 실행합니다. Vite `/api`는 `127.0.0.1:3000`으로 프록시합니다. Vite에서는 `/features/.../frontend/...` 경로로 화면을 엽니다. `PORT`를 바꾸면 vite.config.ts의 proxy target도 맞춰야 합니다. `pnpm preview`에는 API 프록시를 설정하지 않았으므로 전체 기능 확인은 `pnpm start` 또는 `dev + start`로 합니다.

### 관리자 만들기

1. 회원가입 화면에서 본인 계정을 만듭니다.
2. 프로젝트 터미널에서 `corepack pnpm admin:promote 가입한아이디`를 실행합니다.
3. 로그인 후 사용자 관리 화면을 엽니다. 이미 로그인 중이라면 새로고침해도 현재 권한을 다시 읽습니다.

기본 관리자 계정·공용 비밀번호는 만들지 않았습니다. 공개 요청의 `role: ADMIN`은 무시합니다. 권한 부여 명령은 해당 로컬 DB에만 반영되며 DB는 Git에서 제외됩니다. 팀원마다 자기 DB에서 가입·지정을 해야 합니다.

## B — 신고 API에 붙일 공통 인증

`features/reports/backend/index.js` 기준 예제입니다. 실제 신고 API는 B가 구현합니다.

```js
import { requireAuth, requireCanReport } from '../../../shared/backend/auth.middleware.js';
import { requireAdmin } from '../../../shared/backend/admin.middleware.js';

router.post('/', requireAuth, requireCanReport, (req, res) => {
  const authorId = req.user.user_id; // body.authorId를 신뢰하지 않음
  // req.db를 이용해 신고 저장
});
router.get('/admin', requireAuth, requireAdmin, adminController);
```

- 공통 서버가 모든 `/api` 요청에 `req.db`를 제공합니다. 별도 DB 연결을 중복 생성할 필요가 없습니다.
- 인증을 통과하면 `req.user.user_id`, `role`, 유효한 `report_blocked`를 사용합니다.
- 본인 신고 수정/삭제는 `reports.author_id === req.user.user_id`를 서버에서 검사해야 합니다. 공통 인증만으로 소유권 검사가 자동 처리되지는 않습니다.
- 관리자 예외 정책은 각 업무 API에서 명시적으로 정합니다. 사용자 제한 API 자체는 관리자만 접근합니다.

## C·D — 알림 생성 함수

공개 알림 생성 API는 없습니다. 신뢰할 수 있는 서버의 업무 처리 코드에서 호출하세요.

```js
import { createNotification } from '../../account/backend/notification.service.js';
import { recordAudit, transaction } from '../../../shared/backend/audit.service.js';

transaction(req.db, () => {
  // 먼저 매칭 확정 또는 인계 상태 변경 SQL 실행
  createNotification(req.db, {
    userId: recipientUserId, // 업무 데이터에서 결정한 수신자
    type: 'HANDOVER', // C는 MATCH, D는 HANDOVER 또는 EXPIRY
    message: '인계 신청이 승인되었습니다.',
    targetPath: '/features/operations/frontend/handover-status.html',
  });
  recordAudit(req.db, {
    actorId: req.user.user_id, targetType: 'HANDOVER',
    targetId: requestId, action: 'APPROVE',
  });
});
```

`transaction` 콜백은 동기 SQL 작업만 넣습니다. async/await·파일 업로드·외부 API 요청은 트랜잭션 밖에서 완료하세요. 이미 연 트랜잭션 안에서는 `createNotification`과 `recordAudit`만 호출하고 transaction을 중첩하지 않습니다. 알림 생성 함수는 새 알림 ID를 반환합니다.

`targetPath`는 생략 가능하며 서비스 내부의 기능 HTML 경로만 허용합니다. 짧은 URL과 긴 URL 모두 가능하고 단순 ID 쿼리(`?id=1`)도 지원합니다. 외부 URL·javascript:·백슬래시는 거부합니다. 이름·내용 같은 사용자 입력은 프론트에서 textContent로 렌더링합니다.

**C의 매칭 알고리즘과 D의 승인·보관 작업은 아직 미구현이므로 실사용 알림은 해당 업무에서 함수를 연결한 뒤 생성됩니다.** A가 임의의 알림이나 예시 데이터를 실사용 DB에 넣지는 않습니다. 테스트는 메모리·임시 DB에서 세 종류의 생성과 조회·읽음을 확인합니다.

## 프론트에서 API·화면 가드 사용하기

기능의 `frontend/js/*.js` 기준입니다.

```js
import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import '../../../../shared/frontend/js/layout.js';

const user = await requireUser(); // 관리자 화면은 requireUser({ admin: true })
if (user) {
  const result = await api('/api/reports', { method: 'POST', body: formData });
}
```

`requireUser`는 비로그인 시 로그인 화면으로 이동하고 성공 후 원래 경로로 돌아오게 합니다. 화면 가드는 UX용이며 서버의 requireAuth/requireAdmin을 반드시 함께 사용합니다. 업로드용 multipart API는 현재 JSON 전용 공통 보호와 별도 조율이 필요하므로 B가 사진 업로드 구현 시 A와 접두사·검증 방식을 정해야 합니다.

계정 화면은 `<header data-account-layout>`로 공통 메뉴를 만듭니다. 기존 메인처럼 `unimplemented.js`를 import하는 화면에서는 layout도 함께 실행됩니다. C가 메인 코드를 정리할 때 알림 서랍의 기존 예시 마크업/열기 핸들러를 제거하고 이 공통 메뉴로 대체할 수 있습니다.

## 완료 확인·검증 범위

- `corepack pnpm test`: DB·정적 서버·계정 자동 테스트. 현재 22개 통과.
- `corepack pnpm build`: 20개 화면 전체 빌드 통과.
- 계정 테스트는 가입 오류·중복·권한 주입 방지, 비밀번호 해싱, 세션 재발급·만료·폐기·DB 재연결, 알림 소유권/읽음, 관리자 권한/제한/감사 이력, 출처 검사·시도 제한, DB v1→v2 보존 업그레이드를 확인합니다.
- 브라우저 검증 결과는 [당일 작업 기록](work-logs/2026-11-15-A-2단계-완료.md)에 기록합니다.

## 남은 작업과 경계

- **B**: 신고 CRUD·사진 저장·소유권 검사·신고 등록 제한 가드 적용.
- **C**: 실제 메인·검색·상세·매칭·통계 구현, 매칭 사건에 MATCH 알림 함수 연결.
- **D**: 인계·보관·폐기 구현, HANDOVER/EXPIRY 알림 함수 연결 및 반복 알림 방지.
- **전원 3단계**: 가입→신고→검색/매칭→인계→알림의 전체 통합 테스트.
- 아이디 찾기·비밀번호 재설정·이메일 발송은 2단계 A의 필수 항목이 아니므로 미구현입니다. 미동작 버튼은 로그인 화면에서 제거했습니다. 알림은 서비스 내 알림이며 이메일·푸시 발송이 아닙니다.
- 인증 시도 제한은 단일 서버 프로세스의 IP 기준입니다. 다중 서버 배포는 공유 제한 저장소가 필요합니다. HTTPS 배포는 `NODE_ENV=production`, 프록시 배포는 정확한 `APP_ORIGIN`을 설정합니다. 현재는 로컬 과제 실행 기준입니다.

상세 요청·응답은 [API 계약](../shared/contracts/api-contract.md), 권한·제한은 [상태 정의](../shared/contracts/status-definitions.md), 테이블은 [DB 계약](../shared/contracts/database-schema.md)을 확인하세요.

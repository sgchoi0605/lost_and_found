# Lost & Found

처음 참여한 팀원은 [팀원 작업 가이드](팀원_작업가이드.md)를 먼저 읽어주세요. 담당 화면, 실행 방법, GitHub 업로드·PR 절차를 정리했습니다.
전체 파일 목록은 [폴더 구조](docs/폴더구조.md), 설계안과 현재 상태의 차이는 [검토 기록](docs/구조_검토결과.md)에 있습니다.

역할분담 문서에 따른 기능별 협업 골격입니다. 백엔드, DB, 인증, 저장은 아직 구현하지 않았습니다.

## 실행

Node.js 22.12 이상에서 pnpm install 후 pnpm dev로 실행합니다. 빌드는 pnpm build입니다.
루트 index.html은 메인 화면으로 이동합니다. 정적 파일을 직접 열어서는 모듈 JS가 실행되지 않으므로 Vite를 사용하세요.

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
- features/*/backend: 다음 단계의 빈 라우터·서비스·저장소
- shared/frontend: 공통 스타일과 UI 도구
- shared/backend: 다음 단계의 서버·미들웨어 골격
- shared/contracts: API·DB·상태 합의 문서
- database: 로컬 DB 생성 예정, 실제 DB는 Git 제외
- docs: 설계 결정·명세·다이어그램·회의록

기존 3개 화면은 이전했으며 나머지 화면은 구현 예정 표시입니다. 기존 데이터는 예시이며 로그인·신고는 저장하지 않습니다.
현재 URL은 /features/<기능>/frontend/<화면>.html입니다. 짧은 URL 매핑은 백엔드 단계에서 진행합니다.
pnpm-lock.yaml을 유지하므로 package-lock.json은 만들지 않습니다.
Vite 개발 서버는 로컬 개발 용도입니다. 실제 서비스의 정적 공개 범위와 인증은 백엔드 단계에서 설정합니다.

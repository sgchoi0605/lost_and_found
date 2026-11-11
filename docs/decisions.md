# 결정 기록

- 정적 HTML/CSS/JS와 pnpm·Vite를 유지하고 Express + SQLite를 사용합니다.
- A: account/shared 및 루트 설정, B: reports, C: discovery, D: operations.
- 사용자 확인: 1단계 기술·설계 합의는 완료했습니다. DB 컬럼·스키마 설계는 전체 기능에 걸쳐 A(최성규)가 담당합니다.
- 로그인 방식과 권한 정책의 세부 합의값은 인증 구현 단계에 계약 문서로 옮깁니다.
- 브랜치는 전체 프로젝트를 포함하며 폴더별 접근 제한은 아닙니다.
- 3단계: Express의 프론트엔드 정적 제공, 기능별 Router 및 `/health` 연결 확인 경로를 구현했습니다.
- DB, 실제 인증·저장·검색 등 업무 기능은 미구현입니다.
# 결정 기록

- 정적 HTML/CSS/JS와 pnpm·Vite를 유지하고 Express + SQLite를 사용합니다.
- A: account/shared 및 루트 설정, B: reports, C: discovery, D: operations.
- 사용자 확인: 1단계 기술·설계 합의는 완료했습니다. DB 컬럼·스키마 설계는 전체 기능에 걸쳐 A(최성규)가 담당합니다.
- 로그인 방식과 권한 정책의 세부 합의값은 인증 구현 단계에 계약 문서로 옮깁니다.
- 브랜치는 전체 프로젝트를 포함하며 폴더별 접근 제한은 아닙니다.
- 3단계: Express의 프론트엔드 정적 제공, 기능별 Router 및 `/health` 연결 확인 경로를 구현했습니다.
- 4단계: SQLite 연결과 기능별 SQL 초기화를 구현했습니다. 실제 인증·저장·검색 등 업무 API는 미구현입니다.
- 2026-11-12 사용자 지시: `Lost_and_Found_역할분담.md`를 우선 기준으로 삼고 `최성규/diagram`을 보조 자료로 참고합니다.
- 역할분담 문서의 8개 테이블과 Express + SQLite를 유지합니다. ERD의 ACTIVITY_LOGS는 audit_logs, 사진 배열은 report_photos, 보관·폐기 컬럼은 storage_records로 대응합니다.
- DB 접근은 Node 내장 node:sqlite를 사용합니다. 최소 Node 버전은 22.13이며 Node 24.14에서 검증했습니다.
- SQL의 상태 코드와 제약은 4단계 구현 초안입니다. API와 상세 상태 전이 계약은 5단계에서 확정합니다.

# ABC 프로젝트 작업 규칙

정적 HTML/CSS/JS + Vite + Express + SQLite 프로젝트입니다. React를 사용하지 않습니다.
2026-11-25: A/B/C 통합 완료. D operations는 미구현 골격입니다.
모든 수정과 테스트 산출물은 Lost_and_Found_ABC 안에만 둡니다. 원본 Lost_and_Found, Lost_and_Found_B, Lost_and_Found_C는 수정하지 않습니다.
현재 기준은 docs/ABC_통합결과.md, shared/contracts/입니다. docs_A는 과거 A 작업 기록입니다.
공통 미들웨어와 req.db를 재사용합니다. 신고 생성에 requireCanReport를 적용합니다.
확정 매칭·인계·보관 연결이 있는 신고의 변경은 shared/backend/report-policy.js로 보호합니다.
B는 C의 match-lifecycle.service.js를 통해 후보를 무효화합니다. 매칭 상태를 임의로 바꾸지 않습니다.
명령: pnpm db:init, pnpm start, pnpm test, pnpm build. 테스트 임시 파일은 .tmp/에만 둡니다.
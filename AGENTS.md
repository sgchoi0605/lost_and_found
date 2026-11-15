# 프로젝트 작업 규칙

정적 HTML/CSS/JS와 Vite를 사용합니다. React 프로젝트가 아닙니다.
A는 shared 및 루트 설정, B는 reports, C는 discovery, D는 operations를 담당합니다.
각 기능은 features/<기능>/frontend 및 backend에 있습니다.
2026-11-15: 공통 서버·SQLite v2 및 2단계 A(가입·로그인·DB 세션·알림·관리자 사용자 제한) 구현 완료입니다. B/C/D 업무 API는 미구현이므로 물품 예시를 실제 저장·검색 결과로 표현하지 마세요.
Lost_and_Found_역할분담.md를 우선 기준으로 삼고 다이어그램은 보조 자료로 참고합니다. 전체 DB 스키마 설계는 A가 담당합니다.
연동 기준: docs/README.md 및 shared/contracts/. 다른 기능 API는 requireAuth/requireAdmin을 재사용하고 신고 생성은 requireCanReport도 적용하세요.
명령: pnpm db:init, pnpm start, pnpm dev, pnpm build, pnpm test. 관리자 지정: pnpm admin:promote <가입한아이디>.


A 코드는 2칸 들여쓰기와 처리 묶음별 짧은 한국어 주석을 유지하세요. 현재 요약은 docs/README.md, 이전 상세 자료는 docs_A/입니다.

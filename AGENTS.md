# 프로젝트 작업 규칙

정적 HTML/CSS/JS와 Vite를 사용합니다. React 프로젝트가 아닙니다.
A는 shared 및 루트 설정, B는 reports, C는 discovery, D는 operations를 담당합니다.
각 기능은 features/<기능>/frontend 및 backend에 있습니다.
Express 라우팅과 SQLite 연결·초기화는 구현했습니다. 업무 API·인증·화면 저장 연동은 미구현이므로 데모 동작을 실제 인증·저장으로 표현하지 마세요.
Lost_and_Found_역할분담.md를 우선 기준으로 삼고 다이어그램은 보조 자료로 참고합니다. 전체 DB 스키마 설계는 A가 담당합니다.
명령: pnpm dev, pnpm build.


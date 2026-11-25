# Lost & Found ABC

A 공통·계정 + B 신고 + C 검색·매칭·통계를 통합한 프로젝트입니다. D 인계·보관·폐기는 아직 미구현입니다.

실행: `pnpm db:init` → `pnpm start` → http://127.0.0.1:3000

검사: `pnpm test`, `pnpm build`. pnpm이 없으면 설치된 의존성으로 `npm run db:init`, `npm start`, `npm test`, `npm run build`를 사용할 수 있습니다.

- [통합 내용·상태 정책·DB 이전·남은 작업](docs/ABC_통합결과.md)
- [API 계약](shared/contracts/api-contract.md)
- [상태 규칙](shared/contracts/status-definitions.md)

새 환경에서는 Node.js 22.13 이상과 pnpm 10.34.9로 `pnpm install --frozen-lockfile`을 먼저 실행하세요. 원본 세 폴더와 개인 DB는 수정하거나 공유하지 않습니다. DB v3는 이 폴더의 database/에 생성됩니다.
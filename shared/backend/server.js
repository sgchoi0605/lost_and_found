
// 서버 라이브러리와 각 기능의 API 요청을 담당할 라우터를 불러옵니다.
import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import accountRouter from '../../features/account/backend/index.js';
import reportsRouter from '../../features/reports/backend/index.js';
import discoveryRouter from '../../features/discovery/backend/index.js';
import operationsRouter from '../../features/operations/backend/index.js';

// 실행 위치와 무관하게 프로젝트 경로를 구하고 JSON 요청의 크기를 제한합니다.
const root = fileURLToPath(new URL('../../', import.meta.url));
export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// URL의 기능 이름에 따라 요청을 해당 팀원의 라우터로 전달합니다.
app.use('/api/account', accountRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/operations', operationsRouter);

// 첫 접속은 메인 화면으로 보내고, 화면 파일이 있는 폴더만 공개합니다.
// 프로젝트 전체를 공개하지 않아 서버 코드·DB·환경 파일의 접근을 막습니다.
app.get('/', (_req, res) => res.redirect('/discovery/index.html'));
const staticOptions = { dotfiles: 'deny' };
for (const feature of ['account', 'reports', 'discovery', 'operations']) {
  const directory = resolve(root, 'features', feature, 'frontend');
  app.use(`/${feature}`, express.static(directory, staticOptions));
  // Vite에서 쓰던 긴 URL과 기존 북마크도 그대로 사용할 수 있게 연결합니다.
  app.use(`/features/${feature}/frontend`, express.static(directory, staticOptions));
}
// 공통 CSS·JS와 아이콘을 제공하며, 기존 화면의 리소스 경로도 유지합니다.
app.use('/shared/frontend', express.static(resolve(root, 'shared/frontend'), staticOptions));
app.use('/shared', express.static(resolve(root, 'shared/frontend'), staticOptions));
app.use('/public', express.static(resolve(root, 'public'), staticOptions));

// 앞의 라우터와 정적 폴더에서 찾지 못한 요청은 404로 처리합니다.
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '요청한 경로가 없습니다.' } });
});
// 잘못된 JSON 등 요청 오류와 서버 오류를 내부 정보 없이 JSON으로 응답합니다.
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
      message: status === 500 ? '서버 오류가 발생했습니다.' : '요청 형식을 확인해주세요.',
    },
  });
});

// 직접 실행할 때만 서버를 시작합니다. 테스트에서 import할 때는 자동 실행하지 않습니다.
// 환경 변수로 주소·포트를 정하고, 잘못된 포트나 실행 실패를 알립니다.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  app.listen(port, host, () => {
    console.log(`Lost & Found: http://${host}:${port} (DB/authentication not implemented)`);
  }).on('error', (error) => {
    console.error(`Server startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

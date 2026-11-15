// [A] 공통 서버 시작점입니다. API 요청은 각 기능으로, 화면 요청은 frontend 폴더로 보냅니다.

import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createAccountRouter } from '../../features/account/backend/index.js';
import reportsRouter from '../../features/reports/backend/index.js';
import discoveryRouter from '../../features/discovery/backend/index.js';
import operationsRouter from '../../features/operations/backend/index.js';
import { openDatabase } from './database.js';
import { errorMiddleware } from './error.middleware.js';
import { protectMutation } from './request.middleware.js';
const root = fileURLToPath(new URL('../../', import.meta.url));

// 테스트는 db를 주입합니다. 일반 실행은 첫 DB 사용 시 연결하며 db:init은 별도 실행합니다.
export function createApp({ db } = {}) {
  const app = express();
  let ownedDb;
  app.locals.closeDatabase = () => {
    ownedDb?.close();
    ownedDb = undefined;
  };
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  // API 응답은 캐시하지 않습니다. req.db를 처음 읽을 때 DB를 연결해 재사용합니다.
  app.use(
    '/api',
    (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      Object.defineProperty(req, 'db', { get: () => db || (ownedDb ??= openDatabase()) });
      next();
    },
    protectMutation,
  );
  // 주소 접두사에 맞춰 각 담당자의 라우터로 요청을 보냅니다.
  app.use('/api/account', createAccountRouter());
  app.use('/api/reports', reportsRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/operations', operationsRouter);
  // 정적 공개 범위는 frontend와 public뿐입니다. DB·서버 파일은 공개하지 않습니다.
  app.get('/', (_req, res) => res.redirect('/discovery/index.html'));
  const options = { dotfiles: 'deny' };
  for (const feature of ['account', 'reports', 'discovery', 'operations']) {
    const directory = resolve(root, 'features', feature, 'frontend');
    app.use(`/${feature}`, express.static(directory, options));
    app.use(`/features/${feature}/frontend`, express.static(directory, options));
  }
  app.use('/shared/frontend', express.static(resolve(root, 'shared/frontend'), options));
  app.use('/shared', express.static(resolve(root, 'shared/frontend'), options));
  app.use('/public', express.static(resolve(root, 'public'), options));
  // 일치하는 경로가 없으면 404, 처리 중 오류가 나면 공통 오류 응답을 보냅니다.
  app.use((_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: '요청한 경로가 없습니다.' } }),
  );
  app.use(errorMiddleware);
  return app;
}
export const app = createApp();

// 이 파일을 직접 실행한 경우에만 포트를 열고 서버를 시작합니다.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const server = app
    .listen(port, host, () =>
      console.log(`Lost & Found: http://${host}:${port} (먼저 pnpm db:init 실행)`),
    )
    .on('error', (error) => {
      console.error(`Server startup failed: ${error.message}`);
      process.exitCode = 1;
    });
  // 종료 신호를 받으면 HTTP 서버와 DB 연결을 차례로 닫습니다.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () =>
      server.close(() => {
        app.locals.closeDatabase();
        process.exit(0);
      }),
    );
  }
}

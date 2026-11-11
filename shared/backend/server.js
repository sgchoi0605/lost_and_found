
import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import accountRouter from '../../features/account/backend/index.js';
import reportsRouter from '../../features/reports/backend/index.js';
import discoveryRouter from '../../features/discovery/backend/index.js';
import operationsRouter from '../../features/operations/backend/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.use('/api/account', accountRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/operations', operationsRouter);

app.get('/', (_req, res) => res.redirect('/discovery/index.html'));
// Only frontend directories are public. Never mount the repository root.
const staticOptions = { dotfiles: 'deny' };
for (const feature of ['account', 'reports', 'discovery', 'operations']) {
  const directory = resolve(root, 'features', feature, 'frontend');
  app.use(`/${feature}`, express.static(directory, staticOptions));
  // Keep existing Vite URLs and bookmarks working.
  app.use(`/features/${feature}/frontend`, express.static(directory, staticOptions));
}
app.use('/shared/frontend', express.static(resolve(root, 'shared/frontend'), staticOptions));
app.use('/shared', express.static(resolve(root, 'shared/frontend'), staticOptions));
app.use('/public', express.static(resolve(root, 'public'), staticOptions));

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '요청한 경로가 없습니다.' } });
});
app.use((error, _req, res, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
      message: status === 500 ? '서버 오류가 발생했습니다.' : '요청 형식을 확인해주세요.',
    },
  });
});

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

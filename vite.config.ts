// [A] 개발 화면의 API 요청을 Express로 전달하고, 빌드할 HTML 목록을 지정합니다.

import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// 네 기능 폴더의 HTML을 모아 모든 화면을 빌드 대상에 넣습니다.
const pages = ['account', 'reports', 'discovery', 'operations'].flatMap((feature) => {
  const directory = 'features/' + feature + '/frontend';
  return readdirSync(directory)
    .filter((file) => file.endsWith('.html'))
    .map((file) => resolve(directory, file));
});

// 개발 화면과 API 서버를 연결합니다. Express도 별도로 실행해야 합니다.
export default defineConfig({
  base: './',
  server: { proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } } },
  build: { rollupOptions: { input: [resolve('index.html'), ...pages] } },
});

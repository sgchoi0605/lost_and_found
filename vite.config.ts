import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
const pages = ['account', 'reports', 'discovery', 'operations'].flatMap(feature => {
  const directory = 'features/' + feature + '/frontend';
  return readdirSync(directory).filter(file => file.endsWith('.html')).map(file => resolve(directory, file));
});
export default defineConfig({ base: './', build: { rollupOptions: { input: [resolve('index.html'), ...pages] } } });

// 모든 테스트 임시 파일은 이 프로젝트 안에만 생성합니다.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = fileURLToPath(new URL('../.tmp/', import.meta.url));
mkdirSync(temporary, { recursive: true });
const files = process.argv.slice(2);
const result = spawnSync(process.execPath, ['--test', ...(files.length ? files : [
  'shared/backend/*.test.js', 'features/account/account.test.js',
  'features/reports/reports.test.js', 'features/discovery/discovery.test.js',
  'features/operations/operations.test.js', 'tests/*.test.js',
])], { cwd: root, stdio: 'inherit', env: { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary } });
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;

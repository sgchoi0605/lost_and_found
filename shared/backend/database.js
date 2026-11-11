
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// [A] 상대 DB 경로는 실행한 터미널 위치가 아니라 프로젝트 루트를 기준으로 해석합니다.
const root = fileURLToPath(new URL('../../', import.meta.url));
export function resolveDatabasePath(path = process.env.DATABASE_PATH || 'database/lostfound.db') {
  return path === ':memory:' ? path : resolve(root, path);
}

// 호출자가 연결을 사용한 뒤 close()합니다. import만으로 파일을 만들거나 데이터를 넣지 않습니다.
// 외래 키 검사는 모든 연결에 적용하고, 다른 쓰기 작업이 있으면 최대 5초 기다립니다.
export function openDatabase(path) {
  const filename = resolveDatabasePath(path);
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

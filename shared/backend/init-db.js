
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase, resolveDatabasePath } from './database.js';

// [A] 사용자 → 신고 → 매칭 → 인계·보관 순서로 참조 대상 테이블부터 생성합니다.
export const schemaFiles = [
  '../../features/account/account.schema.sql',
  '../../features/reports/reports.schema.sql',
  '../../features/discovery/matching.schema.sql',
  '../../features/operations/operations.schema.sql',
].map(path => fileURLToPath(new URL(path, import.meta.url)));

// 전체 초기화를 한 트랜잭션으로 묶어 중간 실패 시 테이블 일부만 남지 않게 합니다.
// 재실행해도 기존 데이터는 보존하며, 향후 스키마 변경은 별도의 마이그레이션이 필요합니다.
export function initializeDatabase(db, files = schemaFiles) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) throw new Error('현재 코드보다 새로운 DB 버전입니다. 초기화를 중단합니다.');
  if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) {
    throw new Error('외래 키 검사를 활성화한 연결이 필요합니다. openDatabase()를 사용하세요.');
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of files) db.exec(readFileSync(file, 'utf8'));
    if (db.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('DB에 외래 키 위반 데이터가 있습니다.');
    }
    db.exec('PRAGMA user_version = 1; COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// CLI 명령으로 실행할 때만 로컬 DB를 초기화하고, 성공·실패 여부와 관계없이 연결을 닫습니다.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db;
  try {
    db = openDatabase();
    initializeDatabase(db);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    console.log(`DB 초기화 완료: ${resolveDatabasePath()}`);
    console.log(`테이블 ${tables.length}개: ${tables.map(table => table.name).join(', ')}`);
  } catch (error) {
    console.error(`DB 초기화 실패: ${error.message}`);
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

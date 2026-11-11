import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDatabase, resolveDatabasePath } from './database.js';
import { initializeDatabase, schemaFiles } from './init-db.js';

// 실제 운영 DB 대신 각 테스트의 메모리 DB를 쓰고, 종료 시 연결을 정리합니다.
function fixture(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  initializeDatabase(db);
  return db;
}
function seed(db) {
  db.exec(`
    INSERT INTO users (user_id, login_id, email, password_hash, name) VALUES
      (1, 'test-user', 'test@example.invalid', 'test-only-not-a-real-password', '테스트 사용자');
    INSERT INTO reports (report_id, author_id, report_type, item_name, category, place, occurred_at) VALUES
      (1, 1, 'LOST', '지갑', '지갑', '학교', '2026-11-12T01:00:00.000Z'),
      (2, 1, 'FOUND', '지갑', '지갑', '학교', '2026-11-12T02:00:00.000Z');
  `);
}

// 파일 테스트는 임시 폴더 안에서만 생성·정리하며 사용자 DB에는 접근하지 않습니다.
function temporaryDirectory(t) {
  const parent = resolve(tmpdir());
  const directory = mkdtempSync(join(parent, 'lost-found-db-test-'));
  t.after(() => {
    assert.equal(resolve(directory).startsWith(join(parent, 'lost-found-db-test-')), true);
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('creates the eight role-document tables and enables foreign keys', t => {
  const db = fixture(t);
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map(row => row.name);
  assert.deepEqual(tables, ['audit_logs', 'handover_requests', 'matches', 'notifications', 'report_photos', 'reports', 'storage_records', 'users']);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('persists linked records and preserves them across repeated initialization', t => {
  const filename = join(temporaryDirectory(t), 'nested', 'test.db');
  let db = openDatabase(filename);
  try {
    initializeDatabase(db);
    seed(db);
    // 사진·보관·알림·이력도 문서의 분리된 테이블에 실제로 저장되는지 확인합니다.
    db.exec(`
      INSERT INTO report_photos (report_id, photo_url) VALUES (1, '/test/wallet.jpg');
      INSERT INTO matches (lost_report_id, found_report_id, similarity) VALUES (1, 2, 0.8);
      INSERT INTO handover_requests (found_report_id, requester_id, lost_report_id, ownership_proof)
        VALUES (2, 1, 1, '테스트 증빙');
      INSERT INTO storage_records (found_report_id, storage_place, stored_at, storage_deadline)
        VALUES (2, '안내실', '2026-11-12T02:00:00.000Z', '2026-12-12T02:00:00.000Z');
      INSERT INTO notifications (user_id, type, message) VALUES (1, 'MATCH', '테스트 알림');
      INSERT INTO audit_logs (actor_id, target_type, target_id, action, detail_json)
        VALUES (1, 'REPORT', 1, 'CREATE', '{"test":true}');
    `);
  } finally { db.close(); }
  db = openDatabase(filename);
  try {
    initializeDatabase(db);
    initializeDatabase(db);
    for (const table of ['users', 'report_photos', 'matches', 'handover_requests', 'storage_records', 'notifications', 'audit_logs']) {
      assert.equal(db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count, 1, table);
    }
    assert.equal(db.prepare('SELECT count(*) AS count FROM reports').get().count, 2);
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  } finally { db.close(); }
});

test('rejects orphan references, duplicate accounts, invalid states and invalid JSON', t => {
  const db = fixture(t);
  seed(db);
  for (const sql of [
    "INSERT INTO notifications (user_id, type, message) VALUES (999, 'MATCH', 'test')",
    "INSERT INTO report_photos (report_id, photo_url) VALUES (999, '/test.jpg')",
    "INSERT INTO users (login_id, email, password_hash, name) VALUES ('test-user', 'other@example.invalid', 'hash', 'test')",
    "INSERT INTO users (login_id, email, password_hash, name) VALUES ('other', 'TEST@example.invalid', 'hash', 'test')",
    "UPDATE users SET role = 'ROOT' WHERE user_id = 1",
    "UPDATE users SET report_blocked = 2 WHERE user_id = 1",
    "UPDATE reports SET status = 'UNKNOWN' WHERE report_id = 1",
    "INSERT INTO audit_logs (target_type, target_id, action, detail_json) VALUES ('REPORT', 1, 'UPDATE', 'invalid json')",
    "DELETE FROM users WHERE user_id = 1",
  ]) assert.throws(() => db.exec(sql), /constraint/i, sql);
});

test('validates matching direction, unique pairs and similarity range', t => {
  const db = fixture(t);
  seed(db);
  assert.throws(() => db.exec('INSERT INTO matches (lost_report_id, found_report_id) VALUES (2, 1)'), /LOST and FOUND/);
  assert.throws(() => db.exec('INSERT INTO matches (lost_report_id, found_report_id, similarity) VALUES (1, 2, 1.1)'), /constraint/i);
  db.exec('INSERT INTO matches (lost_report_id, found_report_id) VALUES (1, 2)');
  assert.throws(() => db.exec('INSERT INTO matches (lost_report_id, found_report_id) VALUES (1, 2)'), /UNIQUE/);
  assert.throws(() => db.exec('UPDATE matches SET lost_report_id = 2'), /LOST and FOUND/);
  assert.throws(() => db.exec("UPDATE reports SET report_type = 'FOUND' WHERE report_id = 1"), /cannot be changed/);
});

test('validates handover and storage report types on insert and update', t => {
  const db = fixture(t);
  seed(db);
  const request = db.prepare('INSERT INTO handover_requests (found_report_id, requester_id, lost_report_id, ownership_proof) VALUES (?, 1, ?, ?)');
  assert.throws(() => request.run(1, null, '증빙'), /FOUND/);
  assert.throws(() => request.run(2, 2, '증빙'), /LOST/);
  request.run(2, null, '분실 신고 없이도 신청 가능');
  assert.throws(() => db.exec('UPDATE handover_requests SET found_report_id = 1'), /FOUND/);
  assert.throws(() => db.exec('UPDATE handover_requests SET lost_report_id = 2'), /LOST/);
  const storage = db.prepare('INSERT INTO storage_records (found_report_id, storage_place, stored_at, storage_deadline) VALUES (?, ?, ?, ?)');
  assert.throws(() => storage.run(1, '안내실', '2026-11-12', '2026-12-12'), /FOUND/);
  storage.run(2, '안내실', '2026-11-12', '2026-12-12');
  assert.throws(() => db.exec('UPDATE storage_records SET found_report_id = 1'), /FOUND/);
});

test('approval is distinct from completion and completion requires recipient and time', t => {
  const db = fixture(t);
  seed(db);
  db.exec("INSERT INTO handover_requests (found_report_id, requester_id, ownership_proof) VALUES (2, 1, '증빙')");
  db.exec("UPDATE handover_requests SET status = 'APPROVED'");
  assert.equal(db.prepare('SELECT completed_at FROM handover_requests').get().completed_at, null);
  assert.equal(db.prepare('SELECT status FROM reports WHERE report_id = 2').get().status, 'REPORTED');
  assert.throws(() => db.exec("UPDATE handover_requests SET status = 'COMPLETED'"), /constraint/i);
  db.exec("UPDATE handover_requests SET status = 'COMPLETED', recipient_name = '수령인', completed_at = '2026-11-12T03:00:00.000Z'");
  assert.equal(db.prepare('SELECT status FROM handover_requests').get().status, 'COMPLETED');
});

test('rolls back partial initialization on SQL failure', t => {
  const invalidSchema = join(temporaryDirectory(t), 'invalid.sql');
  writeFileSync(invalidSchema, 'THIS IS NOT SQL;', 'utf8');
  const db = openDatabase(':memory:');
  try {
    assert.throws(() => initializeDatabase(db, [schemaFiles[0], invalidSchema]), /syntax/i);
    assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE type = 'table'").get().count, 0);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 0);
    initializeDatabase(db);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  } finally { db.close(); }
});

test('refuses newer database versions and resolves relative paths from the project', t => {
  const db = fixture(t);
  db.exec('PRAGMA user_version = 2');
  assert.throws(() => initializeDatabase(db), /새로운 DB 버전/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(resolveDatabasePath(':memory:'), ':memory:');
  assert.match(resolveDatabasePath('database/lostfound.db'), /database[/\\]lostfound\.db$/);
});

// [A] 터미널 명령으로 기존 계정을 관리자로 지정합니다. 공개 가입 API와는 분리됩니다.

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../../../shared/backend/database.js';
import { transaction, recordAudit } from '../../../shared/backend/audit.service.js';

// 계정이 존재하면 ADMIN으로 바꾸고 기존 신고 제한을 해제합니다.
export function promoteAdmin(db, loginId) {
  return transaction(db, () => {
    const user = db.prepare('SELECT user_id, role FROM users WHERE login_id = ?').get(loginId);
    if (!user) {
      throw new Error('먼저 화면에서 회원가입한 계정의 아이디를 입력하세요.');
    }
    if (user.role !== 'ADMIN') {
      db.prepare(
        "UPDATE users SET role = 'ADMIN', report_blocked = 0, blocked_until = NULL WHERE user_id = ?",
      ).run(user.user_id);
      recordAudit(db, {
        targetType: 'USER',
        targetId: user.user_id,
        action: 'ADMIN_PROMOTE',
        detail: { source: 'local-cli' },
      });
    }
    return user.user_id;
  });
}

// 직접 실행할 때만 명령 인자를 읽습니다. 다른 파일이 import할 때는 실행하지 않습니다.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let db;
  try {
    if (process.argv.length !== 3) {
      throw new Error('사용법: pnpm admin:promote <가입한 아이디>');
    }
    db = openDatabase();
    console.log(`관리자 지정 완료: user_id=${promoteAdmin(db, process.argv[2])}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    db?.close();
  }
}

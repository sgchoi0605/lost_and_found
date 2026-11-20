
// [C] 검색·매칭·통계 기능의 정상·오류 동작 검증

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../../shared/backend/database.js';
import { initializeDatabase } from '../../shared/backend/init-db.js';

import { requireAuth } from '../../shared/backend/auth.middleware.js';
import { requireAdmin } from '../../shared/backend/admin.middleware.js';

import { searchReports } from './backend/search.service.js';
import { getReportDetail } from './backend/detail.service.js';

import {
    calculateSimilarity,
    generateMatchesForReport
} from './backend/matching.service.js';

import {
    listAdminMatches,
    reviewMatch
} from './backend/admin-matching.service.js';

import {
    getMatches,
    getMyMatchableReports
} from './backend/matching.controller.js';

import { getStatistics } from './backend/stats.service.js';


// ========================================
// 테스트 환경 및 데이터 준비
// ========================================

// 실제 로컬 DB와 분리된 임시 DB 생성
function fixture(t) {

    const directory = mkdtempSync(
        join(tmpdir(), 'lost-found-discovery-test-')
    );

    const filename = join(directory, 'test.db');

    const previousPath = process.env.DATABASE_PATH;

    const db = openDatabase(filename);

    process.env.DATABASE_PATH = filename;

    // 테스트 종료 후 환경변수 복구 및 임시 DB 삭제
    t.after(() => {

        if (previousPath === undefined) {
            delete process.env.DATABASE_PATH;
        } else {
            process.env.DATABASE_PATH = previousPath;
        }

        try {
            db.close();
        } finally {
            rmSync(directory, {
                recursive: true,
                force: true
            });
        }
    });

    initializeDatabase(db);

    seed(db);

    return db;
}

// 테스트용 사용자 및 신고 생성
function seed(db) {

    db.exec(`
        INSERT INTO users (
            user_id, login_id, email,
            password_hash, name, role
        ) VALUES
            (1, 'test-user1', 'user1@example.invalid',
             'test-password', '분실 신고자', 'USER'),

            (2, 'test-user2', 'user2@example.invalid',
             'test-password', '습득 신고자', 'USER'),

            (3, 'test-admin', 'admin@example.invalid',
             'test-password', '테스트 관리자', 'ADMIN');

        INSERT INTO reports (
            report_id, author_id, report_type,
            item_name, category, place,
            occurred_at, created_at
        ) VALUES
            (1, 1, 'LOST',
             '검은색 지갑', '지갑', '중앙도서관',
             '2026-11-18T03:00:00Z',
             '2026-11-20T01:00:00Z'),

            (2, 2, 'FOUND',
             '검은색 지갑', '지갑', '중앙도서관',
             '2026-11-18T04:00:00Z',
             '2026-11-20T02:00:00Z'),

            (3, 1, 'LOST',
             '에어팟', '전자기기', '학생회관',
             '2026-11-19T02:00:00Z',
             '2026-11-20T03:00:00Z'),

            (4, 2, 'FOUND',
             '에어팟 프로', '전자기기', '학생회관',
             '2026-11-19T03:00:00Z',
             '2026-11-20T04:00:00Z'),

            (5, 1, 'LOST',
             '파란색 우산', '우산', '정보과학관',
             '2026-11-20T02:00:00Z',
             '2026-11-21T01:00:00Z'),

            (6, 2, 'FOUND',
             '검은색 우산', '우산', '중앙도서관',
             '2026-11-20T04:00:00Z',
             '2026-11-21T02:00:00Z'),

            (7, 2, 'FOUND',
             '검은색 지갑', '지갑', '중앙도서관',
             '2026-11-18T05:00:00Z',
             '2026-11-21T03:00:00Z');

        UPDATE reports
        SET deleted_at = '2026-11-21T04:00:00Z'
        WHERE report_id = 7;

        INSERT INTO report_photos (
            report_id, photo_url
        ) VALUES (
            1, '/test/wallet.jpg'
        );
    `);
}

// 신고 조회 도우미
function getReport(db, id) {

    return db.prepare(`
        SELECT *
        FROM reports
        WHERE report_id = ?
    `).get(id);
}

// 매칭 상태 조회
function getMatchStatus(db, id) {

    return db.prepare(`
        SELECT status
        FROM matches
        WHERE match_id = ?
    `).get(id).status;
}

// 컨트롤러 응답 테스트 도우미
function callController(controller, req) {

    let response;

    controller(
        req,
        {
            json(value) {
                response = value;
            }
        },
        error => {
            throw error;
        }
    );

    return response.data;
}


// ========================================
// 1. 검색 기능
// ========================================

test('search returns active reports only', t => {

    fixture(t);

    const result = searchReports();

    assert.equal(result.total, 6);

    assert.equal(
        result.items.some(
            report => report.report_id === 7
        ),
        false
    );
});


test('search supports keyword and report filters', t => {

    fixture(t);

    assert.equal(
        searchReports({ q: '지갑' }).total,
        2
    );

    assert.equal(
        searchReports({ reportType: 'FOUND' }).total,
        3
    );

    assert.equal(
        searchReports({ category: '전자기기' }).total,
        2
    );

    assert.equal(
        searchReports({ place: '중앙도서관' }).total,
        3
    );

    assert.equal(
        searchReports({ status: 'REPORTED' }).total,
        6
    );

    assert.equal(
        searchReports({ q: '존재하지 않는 물품' }).total,
        0
    );
});


test('search supports combined filters and dates', t => {

    fixture(t);

    assert.equal(
        searchReports({
            q: '지갑',
            reportType: 'FOUND'
        }).total,
        1
    );

    assert.equal(
        searchReports({
            startDate: '2026-11-18',
            endDate: '2026-11-18'
        }).total,
        2
    );
});


test('search supports pagination', t => {

    fixture(t);

    const first = searchReports({
        page: '1',
        limit: '2'
    });

    const second = searchReports({
        page: '2',
        limit: '2'
    });

    assert.equal(first.total, 6);
    assert.equal(first.items.length, 2);
    assert.equal(second.items.length, 2);

    const firstIds = first.items.map(
        report => report.report_id
    );

    const secondIds = second.items.map(
        report => report.report_id
    );

    assert.equal(
        secondIds.some(id => firstIds.includes(id)),
        false
    );
});


// ========================================
// 2. 신고 상세 조회
// ========================================

test('report detail returns the selected report', t => {

    fixture(t);

    const result = getReportDetail(1);

    assert.equal(result.report_id, 1);
    assert.equal(result.item_name, '검은색 지갑');
    assert.equal(result.report_type, 'LOST');
});


test('report detail excludes missing and deleted reports', t => {

    fixture(t);

    assert.equal(getReportDetail(999), null);
    assert.equal(getReportDetail(7), null);
});


// ========================================
// 3. 유사도 계산
// ========================================

test('similarity calculates matching scores correctly', t => {

    const db = fixture(t);

    const wallet = calculateSimilarity(
        getReport(db, 1),
        getReport(db, 2)
    );

    const airpods = calculateSimilarity(
        getReport(db, 3),
        getReport(db, 4)
    );

    const umbrella = calculateSimilarity(
        getReport(db, 5),
        getReport(db, 6)
    );

    assert.equal(wallet.similarity, 1);
    assert.equal(wallet.isCandidate, true);
    assert.equal(wallet.reasons.length, 4);

    assert.equal(airpods.similarity, 0.9);
    assert.equal(airpods.isCandidate, true);

    assert.equal(umbrella.similarity, 0.4);
    assert.equal(umbrella.isCandidate, false);
});


test('similarity rejects invalid matching direction', t => {

    const db = fixture(t);

    const result = calculateSimilarity(
        getReport(db, 2),
        getReport(db, 1)
    );

    assert.equal(result.isCandidate, false);
});


// ========================================
// 4. 매칭 생성 및 알림
// ========================================

test('matching generates candidates and prevents duplicates', t => {

    const db = fixture(t);

    const wallet = generateMatchesForReport(1, 1);
    const airpods = generateMatchesForReport(3, 1);
    const umbrella = generateMatchesForReport(5, 1);
    const duplicate = generateMatchesForReport(1, 1);

    assert.equal(wallet.created, 1);
    assert.equal(wallet.compared, 3);

    assert.equal(airpods.created, 1);
    assert.equal(umbrella.created, 0);

    assert.equal(duplicate.created, 0);
    assert.equal(duplicate.existing, 1);

    const matches = db.prepare(`
        SELECT COUNT(*) AS count
        FROM matches
    `).get();

    assert.equal(matches.count, 2);

    const notifications = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE type = 'MATCH'
    `).get();

    assert.equal(notifications.count, 2);
});


test('matching generation rejects reports owned by other users', t => {

    fixture(t);

    assert.throws(
        () => generateMatchesForReport(1, 2),
        {
            status: 404,
            code: 'NOT_FOUND'
        }
    );
});


// ========================================
// 5. 사용자별 매칭 조회
// ========================================

test('matching results are scoped to the report owners', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);

    const owner = callController(getMatches, {
        db,
        user: { user_id: 1 },
        query: {}
    });

    const unrelatedUser = callController(getMatches, {
        db,
        user: { user_id: 3 },
        query: {}
    });

    assert.equal(owner.total, 1);
    assert.equal(unrelatedUser.total, 0);

    assert.throws(
        () => callController(getMatches, {
            db,
            user: { user_id: 1 },
            query: { reportId: '2' }
        }),
        {
            status: 404,
            code: 'NOT_FOUND'
        }
    );
});


test('matchable reports contain only the current user reports', t => {

    const db = fixture(t);

    const result = callController(
        getMyMatchableReports,
        {
            db,
            user: { user_id: 1 },
            query: {}
        }
    );

    assert.equal(result.total, 3);

    assert.equal(
        result.items.every(
            report => report.report_type === 'LOST'
        ),
        true
    );
});


// ========================================
// 6. 관리자 매칭 관리
// ========================================

test('admin can list and filter matching candidates', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);
    generateMatchesForReport(3, 1);

    assert.equal(
        listAdminMatches(db).total,
        2
    );

    assert.equal(
        listAdminMatches(db, {
            status: 'CANDIDATE'
        }).total,
        2
    );

    assert.equal(
        listAdminMatches(db, {
            status: 'CONFIRMED'
        }).total,
        0
    );
});


test('admin confirms and releases a match with audit records', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);

    reviewMatch(db, 1, 3, 'CONFIRM');

    assert.equal(
        getMatchStatus(db, 1),
        'CONFIRMED'
    );

    assert.equal(getReport(db, 1).status, 'MATCHED');
    assert.equal(getReport(db, 2).status, 'MATCHED');

    reviewMatch(db, 1, 3, 'RELEASE');

    assert.equal(
        getMatchStatus(db, 1),
        'CANDIDATE'
    );

    assert.equal(getReport(db, 1).status, 'REPORTED');
    assert.equal(getReport(db, 2).status, 'REPORTED');

    const actions = db.prepare(`
        SELECT action
        FROM audit_logs
        WHERE target_type = 'MATCH'
        ORDER BY log_id
    `).all().map(row => row.action);

    assert.deepEqual(actions, [
        'MATCH_CONFIRM',
        'MATCH_RELEASE'
    ]);

    // 최초 매칭 알림 1개 및 관리자 처리 알림 4개
    const notifications = db.prepare(`
        SELECT COUNT(*) AS count
        FROM notifications
    `).get();

    assert.equal(notifications.count, 5);
});


test('admin rejects a candidate without changing report states', t => {

    const db = fixture(t);

    generateMatchesForReport(3, 1);

    reviewMatch(db, 1, 3, 'REJECT');

    assert.equal(
        getMatchStatus(db, 1),
        'REJECTED'
    );

    assert.equal(getReport(db, 3).status, 'REPORTED');
    assert.equal(getReport(db, 4).status, 'REPORTED');

    assert.equal(
        listAdminMatches(db, {
            status: 'REJECTED'
        }).total,
        1
    );

    const userMatches = callController(getMatches, {
        db,
        user: { user_id: 1 },
        query: {}
    });

    assert.equal(userMatches.total, 0);
});


test('admin rejects invalid match state transitions', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);

    assert.throws(
        () => reviewMatch(db, 1, 3, 'RELEASE'),
        {
            status: 409,
            code: 'INVALID_STATUS'
        }
    );

    reviewMatch(db, 1, 3, 'CONFIRM');

    assert.throws(
        () => reviewMatch(db, 1, 3, 'CONFIRM'),
        {
            status: 409,
            code: 'INVALID_STATUS'
        }
    );
});


test('admin prevents conflicting confirmed matches', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);

    db.exec(`
        INSERT INTO matches (
            lost_report_id,
            found_report_id,
            source,
            similarity
        ) VALUES (
            3, 2, 'ADMIN', 0.8
        );
    `);

    reviewMatch(db, 1, 3, 'CONFIRM');

    assert.throws(
        () => reviewMatch(db, 2, 3, 'CONFIRM'),
        {
            status: 409,
            code: 'MATCH_CONFLICT'
        }
    );

    assert.equal(
        getMatchStatus(db, 2),
        'CANDIDATE'
    );
});


test('admin prevents releasing a match during handover', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);

    reviewMatch(db, 1, 3, 'CONFIRM');

    db.exec(`
        INSERT INTO handover_requests (
            found_report_id,
            requester_id,
            lost_report_id,
            ownership_proof
        ) VALUES (
            2, 1, 1, '테스트 증빙'
        );
    `);

    assert.throws(
        () => reviewMatch(db, 1, 3, 'RELEASE'),
        {
            status: 409,
            code: 'HANDOVER_CONFLICT'
        }
    );

    assert.equal(
        getMatchStatus(db, 1),
        'CONFIRMED'
    );
});


// ========================================
// 7. 접근 권한 검사
// ========================================

test('unauthenticated and non-admin users are blocked', t => {

    const db = fixture(t);

    assert.throws(
        () => requireAuth(
            { db, headers: {} },
            {},
            () => {}
        ),
        {
            status: 401,
            code: 'UNAUTHENTICATED'
        }
    );

    assert.throws(
        () => requireAdmin(
            { user: { role: 'USER' } },
            {},
            () => {}
        ),
        {
            status: 403,
            code: 'FORBIDDEN'
        }
    );

    let passed = false;

    requireAdmin(
        { user: { role: 'ADMIN' } },
        {},
        () => {
            passed = true;
        }
    );

    assert.equal(passed, true);
});


test('ordinary users cannot review matches', t => {

    const db = fixture(t);

    generateMatchesForReport(1, 1);

    assert.throws(
        () => reviewMatch(db, 1, 1, 'CONFIRM'),
        {
            status: 403,
            code: 'FORBIDDEN'
        }
    );

    assert.equal(
        getMatchStatus(db, 1),
        'CANDIDATE'
    );
});


// ========================================
// 8. 관리자 통계
// ========================================

test('statistics count active reports correctly', t => {

    const db = fixture(t);

    const data = getStatistics(db);

    assert.equal(data.summary.totalReports, 6);
    assert.equal(data.summary.lostReports, 3);
    assert.equal(data.summary.foundReports, 3);
    assert.equal(data.summary.pendingReports, 6);

    assert.equal(
        data.summary.handoverCompletionRate,
        0
    );

    assert.equal(data.byCategory.length, 3);
    assert.equal(data.byDate.length, 2);
    assert.equal(data.handover.totalRequests, 0);
});


test('statistics support type, category and date filters', t => {

    const db = fixture(t);

    assert.equal(
        getStatistics(db, {
            reportType: 'LOST'
        }).summary.totalReports,
        3
    );

    assert.equal(
        getStatistics(db, {
            category: '지갑'
        }).summary.totalReports,
        2
    );

    assert.equal(
        getStatistics(db, {
            reportType: 'LOST',
            category: '지갑'
        }).summary.totalReports,
        1
    );

    assert.equal(
        getStatistics(db, {
            startDate: '2026-11-20',
            endDate: '2026-11-20'
        }).summary.totalReports,
        4
    );
});


test('statistics calculate handover completion rate', t => {

    const db = fixture(t);

    db.exec(`
        UPDATE reports
        SET status = 'HANDED_OVER'
        WHERE report_id = 2;

        INSERT INTO handover_requests (
            found_report_id,
            requester_id,
            lost_report_id,
            ownership_proof,
            status,
            recipient_name,
            completed_at
        ) VALUES (
            2,
            1,
            1,
            '테스트 증빙',
            'COMPLETED',
            '테스트 수령자',
            '2026-11-21T05:00:00Z'
        );
    `);

    const data = getStatistics(db);

    assert.equal(
        data.summary.completedFoundReports,
        1
    );

    assert.equal(
        data.summary.handoverCompletionRate,
        33.33
    );

    assert.equal(data.summary.pendingReports, 5);
    assert.equal(data.handover.completed, 1);
});


test('statistics handle empty results and invalid filters', t => {

    const db = fixture(t);

    const lostOnly = getStatistics(db, {
        reportType: 'LOST'
    });

    assert.equal(
        lostOnly.summary.handoverCompletionRate,
        null
    );

    const empty = getStatistics(db, {
        category: '없는 카테고리'
    });

    assert.equal(empty.summary.totalReports, 0);

    assert.equal(
        empty.summary.handoverCompletionRate,
        null
    );

    assert.throws(
        () => getStatistics(db, {
            startDate: '2026-11-21',
            endDate: '2026-11-20'
        }),
        {
            status: 400,
            code: 'VALIDATION_ERROR'
        }
    );

    assert.throws(
        () => getStatistics(db, {
            startDate: '2026-02-30'
        }),
        {
            status: 400,
            code: 'VALIDATION_ERROR'
        }
    );
});


import { api } from '../../../../shared/frontend/js/api.js';

const statusFilter = document.getElementById('statusFilter');
const refreshButton = document.getElementById('refreshButton');

const results = document.getElementById('adminMatchResults');
const resultCount = document.getElementById('resultCount');
const message = document.getElementById('message');
const loginLink = document.getElementById('loginLink');

const pagination = document.getElementById('pagination');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const pageInfo = document.getElementById('pageInfo');

let currentPage = 1;
let totalPages = 1;
let loading = false;
let processing = false;
let accessDenied = false;

const matchStatusLabels = {
    CANDIDATE: '매칭 후보',
    CONFIRMED: '매칭 확정',
    REJECTED: '매칭 거절'
};

const reportStatusLabels = {
    REPORTED: '신고됨',
    RECEIVED: '접수됨',
    STORED: '보관 중',
    MATCHED: '매칭됨',
    HANDOVER_IN_PROGRESS: '인계 진행 중',
    HANDED_OVER: '인계 완료',
    DISPOSED: '폐기됨',
    TRANSFERRED: '이관됨'
};

const actionLabels = {
    CONFIRM: '매칭 확정',
    REJECT: '매칭 거절',
    RELEASE: '매칭 해제'
};

// 안전한 화면 요소 생성
function createElement(tag, className, text) {

    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

// 날짜 형식 변환
function formatDate(value) {

    if (!value) return '미처리';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? '정보 없음'
        : date.toLocaleString('ko-KR');
}

// 버튼 활성화 상태 관리
function updateControls() {

    const disabled =
        loading || processing || accessDenied;

    statusFilter.disabled = disabled;
    refreshButton.disabled = disabled;

    prevButton.disabled =
        disabled || currentPage <= 1;

    nextButton.disabled =
        disabled || currentPage >= totalPages;

    for (const button of results.querySelectorAll('button')) {
        button.disabled = disabled;
    }
}

// API 오류 표시
function showError(error) {

    message.textContent = error.message;

    if (error.status === 401) {

        loginLink.hidden = false;
        accessDenied = true;

    } else if (error.status === 403) {

        message.textContent =
            '관리자만 접근할 수 있는 페이지입니다.';

        accessDenied = true;
    }

    if (accessDenied) {
        results.replaceChildren();
        resultCount.textContent = '';
        pagination.hidden = true;
    }

    updateControls();
}

// 물품 정보 비교 패널
function createReportPanel(report, label) {

    const panel = createElement(
        'div',
        'match-report-panel'
    );

    panel.appendChild(
        createElement('h3', '', label)
    );

    panel.appendChild(
        createElement('strong', '', report.item_name)
    );

    panel.appendChild(
        createElement(
            'p',
            '',
            `신고 번호: ${report.report_id}`
        )
    );

    panel.appendChild(
        createElement(
            'p',
            '',
            `카테고리: ${report.category}`
        )
    );

    panel.appendChild(
        createElement(
            'p',
            '',
            `장소: ${report.place}`
        )
    );

    panel.appendChild(
        createElement(
            'p',
            '',
            `발생 일시: ${formatDate(report.occurred_at)}`
        )
    );

    panel.appendChild(
        createElement(
            'p',
            '',
            `신고 상태: ${
                reportStatusLabels[report.status]
                || report.status
            }`
        )
    );

    const link = createElement(
        'a',
        '',
        '신고 상세보기'
    );

    link.href =
        `./report-detail.html?id=${encodeURIComponent(report.report_id)}`;

    panel.appendChild(link);

    return panel;
}

// 관리자 처리 버튼 생성
function createActionButton(matchId, action, className) {

    const button = createElement(
        'button',
        className,
        actionLabels[action]
    );

    button.type = 'button';

    button.addEventListener('click', () => {
        reviewMatch(matchId, action);
    });

    return button;
}

// 관리자 매칭 카드 생성
function createMatchCard(match) {

    const card = createElement(
        'article',
        'match-card admin-match-card'
    );

    const heading = createElement(
        'div',
        'admin-match-heading'
    );

    heading.appendChild(
        createElement(
            'h2',
            '',
            `매칭 #${match.match_id}`
        )
    );

    heading.appendChild(
        createElement(
            'span',
            `status match-status-${match.status.toLowerCase()}`,
            matchStatusLabels[match.status] || match.status
        )
    );

    card.appendChild(heading);

    const score = match.similarity === null
        ? '유사도 미산정'
        : `유사도 ${Math.round(match.similarity * 100)}%`;

    card.appendChild(
        createElement('h3', 'match-score', score)
    );

    card.appendChild(
        createElement(
            'p',
            '',
            match.source === 'AUTO'
                ? '생성 방식: 자동 매칭'
                : '생성 방식: 관리자 등록'
        )
    );

    // 분실·습득물 비교
    const comparison = createElement(
        'div',
        'comparison'
    );

    comparison.appendChild(
        createReportPanel(match.lost, '분실물')
    );

    comparison.appendChild(
        createReportPanel(match.found, '습득물')
    );

    card.appendChild(comparison);

    // 매칭 근거
    card.appendChild(
        createElement('h3', '', '현재 비교 근거')
    );

    const factors = createElement(
        'ul',
        'match-factors'
    );

    if (match.reasons.length === 0) {

        factors.appendChild(
            createElement('li', '', '일치하는 항목 없음')
        );
    }

    for (const reason of match.reasons) {

        factors.appendChild(
            createElement('li', '', `✓ ${reason}`)
        );
    }

    card.appendChild(factors);

    if (
        match.similarity !== null &&
        match.similarity !== match.currentSimilarity
    ) {
        card.appendChild(
            createElement(
                'p',
                '',
                `현재 정보 기준 유사도: ${
                    Math.round(match.currentSimilarity * 100)
                }%`
            )
        );
    }

    // 생성 및 검토 정보
    const reviewInfo = createElement(
        'div',
        'review-info'
    );

    reviewInfo.appendChild(
        createElement(
            'p',
            '',
            `매칭 생성일: ${formatDate(match.created_at)}`
        )
    );

    reviewInfo.appendChild(
        createElement(
            'p',
            '',
            `최근 검토일: ${formatDate(match.reviewed_at)}`
        )
    );

    reviewInfo.appendChild(
        createElement(
            'p',
            '',
            `검토 관리자: ${
                match.reviewed_by === null
                    ? '미검토'
                    : `#${match.reviewed_by}`
            }`
        )
    );

    card.appendChild(reviewInfo);

    // 매칭 상태에 따른 처리 버튼
    const actions = createElement(
        'div',
        'admin-match-actions'
    );

    if (match.status === 'CANDIDATE') {

        actions.appendChild(
            createActionButton(
                match.match_id,
                'CONFIRM',
                'btn btn-primary'
            )
        );

        actions.appendChild(
            createActionButton(
                match.match_id,
                'REJECT',
                'btn btn-secondary'
            )
        );

    } else if (match.status === 'CONFIRMED') {

        actions.appendChild(
            createActionButton(
                match.match_id,
                'RELEASE',
                'btn btn-secondary'
            )
        );

    } else {

        actions.appendChild(
            createElement(
                'p',
                '',
                '거절 처리된 매칭입니다.'
            )
        );
    }

    card.appendChild(actions);

    return card;
}

// 관리자 매칭 목록 조회
async function loadMatches(page = 1, notice = '') {

    loading = true;
    updateControls();

    results.replaceChildren();
    resultCount.textContent = '';
    message.textContent = '매칭 목록을 불러오는 중입니다.';
    pagination.hidden = true;

    const query = new URLSearchParams({
        page: String(page),
        limit: '20'
    });

    if (statusFilter.value) {
        query.set('status', statusFilter.value);
    }

    try {

        const data = await api(
            `/api/discovery/admin/matches?${query.toString()}`
        );

        currentPage = data.page;

        totalPages = Math.max(
            1,
            Math.ceil(data.total / data.limit)
        );

        resultCount.textContent =
            `총 ${data.total}개의 매칭 결과`;

        message.textContent = notice ||
            (
                data.items.length === 0
                    ? '해당 상태의 매칭 결과가 없습니다.'
                    : ''
            );

        for (const match of data.items) {

            results.appendChild(
                createMatchCard(match)
            );
        }

        pageInfo.textContent =
            `${currentPage} / ${totalPages}`;

        pagination.hidden = data.total === 0;

    } catch (error) {

        showError(error);

    } finally {

        loading = false;
        updateControls();
    }
}

// 매칭 확정·거절·해제 요청
async function reviewMatch(matchId, action) {

    if (processing || loading || accessDenied) return;

    const label = actionLabels[action];

    if (!window.confirm(`#${matchId} 매칭을 ${label} 처리하시겠습니까?`)) {
        return;
    }

    processing = true;
    updateControls();

    message.textContent = `${label} 처리 중입니다.`;

    try {

        await api(
            `/api/discovery/admin/matches/${matchId}/review`,
            {
                method: 'POST',
                body: { action }
            }
        );

        await loadMatches(
            1,
            `${label} 처리가 완료되었습니다.`
        );

    } catch (error) {

        showError(error);

    } finally {

        processing = false;
        updateControls();
    }
}

// 매칭 상태 필터
statusFilter.addEventListener('change', () => {
    loadMatches(1);
});

// 새로고침
refreshButton.addEventListener('click', () => {
    loadMatches(1);
});

// 이전 페이지
prevButton.addEventListener('click', () => {

    if (currentPage > 1) {
        loadMatches(currentPage - 1);
    }
});

// 다음 페이지
nextButton.addEventListener('click', () => {

    if (currentPage < totalPages) {
        loadMatches(currentPage + 1);
    }
});

// 최초 화면 실행
loadMatches();

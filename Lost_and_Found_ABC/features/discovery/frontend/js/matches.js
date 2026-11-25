
import { api } from '../../../../shared/frontend/js/api.js';

const reportSelect = document.getElementById('reportSelect');
const generateButton = document.getElementById('generateButton');
const matchResults = document.getElementById('matchResults');
const resultCount = document.getElementById('resultCount');
const message = document.getElementById('message');
const loginLink = document.getElementById('loginLink');

const pagination = document.getElementById('pagination');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const pageInfo = document.getElementById('pageInfo');

const params = new URLSearchParams(window.location.search);

const matchableIds = new Set();

let currentPage = 1;
let totalPages = 1;
let requestId = 0;
let generating = false;

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
    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? '정보 없음'
        : date.toLocaleString('ko-KR');
}

// 매칭 버튼 활성화 조건
function updateButton() {
    generateButton.disabled =
        generating || !matchableIds.has(reportSelect.value);
}

// API 오류 표시
function showError(error) {
    message.textContent = error.message;

    if (error.status === 401) {
        loginLink.hidden = false;
        generateButton.disabled = true;
    }
}

// 물품 비교 정보 생성
function createReportPanel(report, label) {
    const panel = createElement('div', 'match-report-panel');

    panel.appendChild(createElement('h3', '', label));
    panel.appendChild(createElement('strong', '', report.item_name));

    panel.appendChild(
        createElement('p', '', `카테고리: ${report.category}`)
    );

    panel.appendChild(
        createElement('p', '', `장소: ${report.place}`)
    );

    panel.appendChild(
        createElement('p', '', `발생 일시: ${formatDate(report.occurred_at)}`)
    );

    const link = createElement('a', '', '상세보기');

    link.href =
        `./report-detail.html?id=${encodeURIComponent(report.report_id)}`;

    panel.appendChild(link);

    return panel;
}

// 매칭 결과 카드 생성
function createMatchCard(match) {
    const card = createElement('article', 'match-card');

    const score = match.similarity === null
        ? '유사도 정보 없음'
        : `유사도 ${Math.round(match.similarity * 100)}%`;

    card.appendChild(
        createElement('h2', '', score)
    );

    card.appendChild(
        createElement(
            'p',
            'status',
            match.status === 'CONFIRMED'
                ? '매칭 확정'
                : '매칭 후보'
        )
    );

    const comparison = createElement('div', 'comparison');

    comparison.appendChild(
        createReportPanel(match.lost, '분실물')
    );

    comparison.appendChild(
        createReportPanel(match.found, '습득물')
    );

    card.appendChild(comparison);

    // 매칭 근거 표시
    card.appendChild(
        createElement('h3', '', '현재 비교 근거')
    );

    const factors = createElement('ul', 'match-factors');

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
                `현재 정보 기준 유사도: ${Math.round(match.currentSimilarity * 100)}%`
            )
        );
    }

    card.appendChild(
        createElement(
            'p',
            '',
            '유사도는 비교 점수이며 동일한 물품임을 보장하지 않습니다.'
        )
    );

    const availableStatuses = [
        'REPORTED',
        'RECEIVED',
        'STORED',
        'MATCHED'
    ];

    if (availableStatuses.includes(match.found.status)) {
        const handoverLink = createElement(
            'a',
            'btn btn-primary',
            '인계 신청하기'
        );

        handoverLink.href =
            `/features/operations/frontend/handover-apply.html?foundReportId=${match.found.report_id}`;

        card.appendChild(handoverLink);
    }

    return card;
}

// 본인의 매칭 가능한 신고 목록 조회
async function loadMyReports() {
    let page = 1;
    let loaded = 0;

    while (true) {
        const data = await api(
            `/api/discovery/matchable-reports?page=${page}&limit=100`
        );

        for (const report of data.items) {
            const option = document.createElement('option');

            option.value = String(report.report_id);

            const type =
                report.report_type === 'LOST'
                    ? '분실'
                    : '습득';

            option.textContent =
                `[${type}] ${report.item_name} (#${report.report_id})`;

            reportSelect.appendChild(option);

            matchableIds.add(option.value);
        }

        loaded += data.items.length;

        if (
            loaded >= data.total ||
            data.items.length === 0
        ) {
            break;
        }

        page++;
    }

    // 상세 페이지 또는 알림에서 전달한 신고 ID
    const reportId = params.get('reportId');

    if (reportId && /^[1-9]\d*$/.test(reportId)) {

        if (!matchableIds.has(reportId)) {
            const option = document.createElement('option');

            option.value = reportId;
            option.textContent = `신고 #${reportId} 결과 조회`;

            reportSelect.appendChild(option);
        }

        reportSelect.value = reportId;
    }

    updateButton();
}

// 실제 매칭 결과 API 호출
async function loadMatches(page = 1) {
    const currentRequest = ++requestId;

    matchResults.replaceChildren();
    resultCount.textContent = '';
    message.textContent = '매칭 결과를 불러오는 중입니다...';
    pagination.hidden = true;

    const query = new URLSearchParams({
        page: String(page),
        limit: '20'
    });

    if (reportSelect.value) {
        query.set('reportId', reportSelect.value);
    }

    try {
        const data = await api(
            `/api/discovery/matches?${query.toString()}`
        );

        if (currentRequest !== requestId) return;

        currentPage = data.page;
        totalPages = Math.max(
            1,
            Math.ceil(data.total / data.limit)
        );

        resultCount.textContent =
            `총 ${data.total}개의 매칭 결과`;

        message.textContent =
            data.items.length === 0
                ? '유사한 물품이 아직 없습니다.'
                : '';

        for (const match of data.items) {
            matchResults.appendChild(
                createMatchCard(match)
            );
        }

        pageInfo.textContent =
            `${currentPage} / ${totalPages}`;

        prevButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= totalPages;

        pagination.hidden = data.total === 0;

    } catch (error) {
        if (currentRequest === requestId) {
            showError(error);
        }
    }
}

// 매칭 후보 생성
generateButton.addEventListener('click', async () => {
    const reportId = reportSelect.value;

    if (!matchableIds.has(reportId)) return;

    generating = true;
    reportSelect.disabled = true;

    updateButton();

    message.textContent = '유사한 물품을 찾는 중입니다...';

    try {
        const result = await api(
            `/api/discovery/reports/${reportId}/matches`,
            {
                method: 'POST',
                body: {}
            }
        );

        await loadMatches(1);

        alert(
            `새로운 매칭 ${result.created}개\n기존 매칭 ${result.existing}개`
        );

    } catch (error) {
        showError(error);

    } finally {
        generating = false;
        reportSelect.disabled = false;
        updateButton();
    }
});

// 선택한 신고의 매칭 결과 조회
reportSelect.addEventListener('change', () => {
    updateButton();
    loadMatches(1);
});

// 페이지 이동
prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
        loadMatches(currentPage - 1);
    }
});

nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
        loadMatches(currentPage + 1);
    }
});

// 최초 접속
async function initialize() {
    try {
        await loadMyReports();
        await loadMatches();

    } catch (error) {
        showError(error);
    }
}

initialize();

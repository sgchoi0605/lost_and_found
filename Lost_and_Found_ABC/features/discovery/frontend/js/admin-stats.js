
import { api } from '../../../../shared/frontend/js/api.js';

const filterForm = document.getElementById('filterForm');

const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const reportType = document.getElementById('reportType');
const category = document.getElementById('category');

const searchButton = document.getElementById('searchButton');
const resetButton = document.getElementById('resetButton');

const message = document.getElementById('message');
const loginLink = document.getElementById('loginLink');
const statsContent = document.getElementById('statsContent');

const typeChart = document.getElementById('typeChart');
const categoryChart = document.getElementById('categoryChart');
const statusChart = document.getElementById('statusChart');
const dateChart = document.getElementById('dateChart');

const categoryTableBody =
    document.getElementById('categoryTableBody');

const dateTableBody =
    document.getElementById('dateTableBody');

const completionRate =
    document.getElementById('completionRate');

const completionProgress =
    document.getElementById('completionProgress');

const completionDescription =
    document.getElementById('completionDescription');

let loading = false;
let accessDenied = false;

const typeLabels = {
    LOST: '분실물',
    FOUND: '습득물'
};

const statusLabels = {
    REPORTED: '신고됨',
    RECEIVED: '접수됨',
    STORED: '보관 중',
    MATCHED: '매칭됨',
    HANDOVER_IN_PROGRESS: '인계 진행 중',
    HANDED_OVER: '인계 완료',
    DISPOSED: '폐기됨',
    TRANSFERRED: '이관됨'
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

// 숫자 표시 형식
function formatCount(value) {

    return `${Number(value).toLocaleString('ko-KR')}건`;
}

// 조회 중 중복 요청 방지
function updateControls() {

    const disabled = loading || accessDenied;

    startDate.disabled = disabled;
    endDate.disabled = disabled;
    reportType.disabled = disabled;
    category.disabled = disabled;

    searchButton.disabled = disabled;
    resetButton.disabled = disabled;
}

// API 오류 처리
function showError(error) {

    statsContent.hidden = true;

    message.textContent = error.message;

    if (error.status === 401) {

        loginLink.hidden = false;
        accessDenied = true;

    } else if (error.status === 403) {

        message.textContent =
            '관리자만 접근할 수 있는 페이지입니다.';

        accessDenied = true;
    }

    updateControls();
}

// 실제 DB 카테고리 선택지 생성
function renderCategories(categories, selectedCategory) {

    category.replaceChildren();

    const allOption = document.createElement('option');

    allOption.value = '';
    allOption.textContent = '전체';

    category.appendChild(allOption);

    for (const name of categories) {

        const option = document.createElement('option');

        option.value = name;
        option.textContent = name;

        category.appendChild(option);
    }

    if (
        selectedCategory &&
        !categories.includes(selectedCategory)
    ) {

        const option = document.createElement('option');

        option.value = selectedCategory;
        option.textContent = selectedCategory;

        category.appendChild(option);
    }

    category.value = selectedCategory;
}

// 핵심 신고 통계 표시
function renderSummary(summary) {

    const keys = [
        'totalReports',
        'lostReports',
        'foundReports',
        'matchedReports',
        'completedFoundReports',
        'pendingReports'
    ];

    for (const key of keys) {

        document.getElementById(key).textContent =
            formatCount(summary[key]);
    }
}

// 막대 그래프 생성
function renderBarChart(container, rows, total) {

    container.replaceChildren();

    if (rows.length === 0 || total === 0) {

        container.appendChild(
            createElement(
                'p',
                'empty-state',
                '조회 조건에 해당하는 데이터가 없습니다.'
            )
        );

        return;
    }

    for (const row of rows) {

        const chartRow = createElement(
            'div',
            'stats-chart-row'
        );

        const label = createElement(
            'div',
            'stats-chart-label',
            row.label
        );

        const percent = row.count / total * 100;

        const value = createElement(
            'span',
            'stats-chart-value',
            `${formatCount(row.count)} (${percent.toFixed(1)}%)`
        );

        const progress = createElement(
            'progress',
            'stats-chart-progress'
        );

        progress.max = total;
        progress.value = row.count;

        progress.setAttribute(
            'aria-label',
            `${row.label} ${formatCount(row.count)}`
        );

        chartRow.append(label, progress, value);

        container.appendChild(chartRow);
    }
}

// 카테고리 및 일별 통계 표 생성
function renderTable(body, rows, labelKey) {

    body.replaceChildren();

    if (rows.length === 0) {

        const tr = document.createElement('tr');
        const td = document.createElement('td');

        td.colSpan = 4;
        td.textContent = '조회 결과가 없습니다.';

        tr.appendChild(td);
        body.appendChild(tr);

        return;
    }

    for (const row of rows) {

        const tr = document.createElement('tr');

        const values = [
            row[labelKey],
            formatCount(row.lostCount),
            formatCount(row.foundCount),
            formatCount(row.count)
        ];

        for (const value of values) {

            tr.appendChild(
                createElement('td', '', value)
            );
        }

        body.appendChild(tr);
    }
}

// 인계 완료율 표시
function renderCompletionRate(summary) {

    const rate = summary.handoverCompletionRate;

    if (rate === null) {

        completionRate.textContent = '집계 대상 없음';

        completionProgress.hidden = true;

        completionDescription.textContent =
            '조회 조건에 해당하는 습득 신고가 없습니다.';

        return;
    }

    completionRate.textContent = `${rate}%`;

    completionProgress.hidden = false;
    completionProgress.value = rate;

    completionDescription.textContent =
        `인계 완료 ${formatCount(summary.completedFoundReports)}` +
        ` / 전체 습득 신고 ${formatCount(summary.foundReports)}`;
}

// 인계 신청 현황 표시
function renderHandover(handover) {

    const keys = [
        'totalRequests',
        'requested',
        'underReview',
        'approved',
        'rejected',
        'completed',
        'pendingRequests'
    ];

    for (const key of keys) {

        document.getElementById(key).textContent =
            formatCount(handover[key]);
    }
}

// 전체 통계 데이터 화면 출력
function renderStatistics(data) {

    const total = data.summary.totalReports;

    renderSummary(data.summary);

    // 신고 유형별 그래프
    renderBarChart(
        typeChart,
        ['LOST', 'FOUND'].map(type => ({
            label: typeLabels[type],
            count: data.byType.find(
                row => row.report_type === type
            )?.count ?? 0
        })),
        total
    );

    // 카테고리별 그래프
    renderBarChart(
        categoryChart,
        data.byCategory.map(row => ({
            label: row.category,
            count: row.count
        })),
        total
    );

    // 신고 상태별 그래프
    renderBarChart(
        statusChart,
        data.byStatus.map(row => ({
            label: statusLabels[row.status] || row.status,
            count: row.count
        })),
        total
    );

    // 일별 그래프
    renderBarChart(
        dateChart,
        data.byDate.map(row => ({
            label: row.date,
            count: row.count
        })),
        total
    );

    renderTable(
        categoryTableBody,
        data.byCategory,
        'category'
    );

    renderTable(
        dateTableBody,
        data.byDate,
        'date'
    );

    renderCompletionRate(data.summary);

    renderHandover(data.handover);

    statsContent.hidden = false;
}

// 통계 API 호출
async function loadStatistics() {

    if (loading || accessDenied) return;

    if (
        startDate.value &&
        endDate.value &&
        startDate.value > endDate.value
    ) {

        statsContent.hidden = true;

        message.textContent =
            '시작일은 종료일보다 늦을 수 없습니다.';

        return;
    }

    loading = true;

    updateControls();

    message.textContent =
        '통계 데이터를 불러오는 중입니다.';

    statsContent.hidden = true;

    const query = new URLSearchParams();

    if (startDate.value) {
        query.set('startDate', startDate.value);
    }

    if (endDate.value) {
        query.set('endDate', endDate.value);
    }

    if (reportType.value) {
        query.set('reportType', reportType.value);
    }

    if (category.value) {
        query.set('category', category.value);
    }

    try {

        const data = await api(
            `/api/discovery/admin/stats?${query.toString()}`
        );

        renderCategories(
            data.categories,
            data.filters.category
        );

        renderStatistics(data);

        message.textContent =
            data.summary.totalReports === 0
                ? '조회 조건에 해당하는 신고가 없습니다.'
                : '통계 조회가 완료되었습니다.';

    } catch (error) {

        showError(error);

    } finally {

        loading = false;

        updateControls();
    }
}

// 조회 버튼
filterForm.addEventListener('submit', event => {

    event.preventDefault();

    loadStatistics();
});

// 필터 초기화
resetButton.addEventListener('click', () => {

    filterForm.reset();

    loadStatistics();
});

// 최초 화면 실행
loadStatistics();

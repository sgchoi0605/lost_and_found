
import { api } from '../../../../shared/frontend/js/api.js';

// 검색 화면 요소
const form = document.getElementById('searchForm');
const results = document.getElementById('searchResults');
const resultCount = document.getElementById('resultCount');
const message = document.getElementById('message');

const resetButton = document.getElementById('resetButton');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const pageInfo = document.getElementById('pageInfo');
const pagination = document.getElementById('pagination');

let currentPage = 1;
let totalPages = 1;
let activeRequest = 0;
let activeConditions = new URLSearchParams();

const LIMIT = 20;

// 신고 상태를 한글로 표시
const statusLabels = {
    REPORTED: '신고됨',
    RECEIVED: '접수됨',
    STORED: '보관 중',
    MATCHED: '매칭됨',
    HANDOVER_IN_PROGRESS: '인계 진행 중',
    HANDED_OVER: '인계 완료',
    DISPOSED: '폐기',
    TRANSFERRED: '이관'
};

// 안전한 텍스트 요소 생성
function createText(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

// 검색 결과 카드 생성
function createReportCard(report) {
    const card = document.createElement('article');
    card.className = 'search-result-card';

    const type = report.report_type === 'LOST'
        ? '분실물'
        : '습득물';

    card.appendChild(createText('span', type));

    // 등록된 사진이 있는 경우 표시
    if (report.photo_url) {
        try {
            const url = new URL(
                report.photo_url,
                window.location.origin
            );

            if (url.origin === window.location.origin) {
                const image = document.createElement('img');
                image.src = url.href;
                image.alt = report.item_name;
                image.width = 120;
                image.loading = 'lazy';

                card.appendChild(image);
            }
        } catch {
            // 잘못된 사진 주소는 표시하지 않음
        }
    }

    card.appendChild(
        createText('h3', report.item_name)
    );

    card.appendChild(
        createText('p', `카테고리: ${report.category}`)
    );

    card.appendChild(
        createText('p', `장소: ${report.place}`)
    );

    const date = new Date(report.occurred_at);

    card.appendChild(
        createText('p',
            `발생 일시: ${date.toLocaleString('ko-KR')}`
        )
    );

    card.appendChild(
        createText('p',
            `상태: ${statusLabels[report.status] || report.status}`
        )
    );

    const link = document.createElement('a');

    link.href = `./report-detail.html?id=${encodeURIComponent(report.report_id)}`;
    link.textContent = '상세보기';

    card.appendChild(link);

    return card;
}

// 현재 입력된 검색 조건 저장
function readConditions() {
    const params = new URLSearchParams();
    const formData = new FormData(form);

    for (const [key, value] of formData.entries()) {
        if (value.trim()) {
            params.set(key, value.trim());
        }
    }

    return params;
}

// 검색 API 호출
async function search(page = 1) {
    const requestId = ++activeRequest;

    const params = new URLSearchParams(activeConditions);

    params.set('page', page);
    params.set('limit', LIMIT);

    results.replaceChildren();
    resultCount.textContent = '';
    message.textContent = '검색 중입니다...';
    pagination.hidden = true;

    try {
        const data = await api(
            `/api/discovery/reports?${params.toString()}`
        );

        if (requestId !== activeRequest) return;

        currentPage = data.page;

        totalPages = Math.max(
            1,
            Math.ceil(data.total / data.limit)
        );

        resultCount.textContent =
            `총 ${data.total}개의 검색 결과`;

        message.textContent = '';

        if (data.items.length === 0) {
            message.textContent = '검색 결과가 없습니다.';
        }

        for (const report of data.items) {
            results.appendChild(createReportCard(report));
        }

        pageInfo.textContent =
            `${currentPage} / ${totalPages}`;

        prevButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= totalPages;

        pagination.hidden = data.total === 0;

    } catch (error) {
        if (requestId !== activeRequest) return;

        message.textContent = error.message;
    }
}

// 검색 버튼
form.addEventListener('submit', (event) => {
    event.preventDefault();

    activeConditions = readConditions();

    search(1);
});

// 검색 조건 초기화
resetButton.addEventListener('click', () => {
    form.reset();

    activeConditions = new URLSearchParams();

    search(1);
});

// 이전 페이지
prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
        search(currentPage - 1);
    }
});

// 다음 페이지
nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
        search(currentPage + 1);
    }
});

// 메인 화면에서 전달한 검색 조건 반영
const initialParams = new URLSearchParams(
    window.location.search
);

for (const key of [
    'q', 'reportType', 'category',
    'place', 'startDate', 'endDate', 'status'
]) {
    if (initialParams.has(key)) {
        form.elements.namedItem(key).value =
            initialParams.get(key);
    }
}

activeConditions = readConditions();

// 최초 접속 시 신고 목록 조회
search();


import { api } from '../../../../shared/frontend/js/api.js';

const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');

const foundGrid = document.getElementById('foundGrid');
const emptyState = document.getElementById('emptyState');

const loginLink = document.getElementById('loginLink');
const notificationButton = document.getElementById('notificationButton');

const myReportMessage = document.getElementById('myReportMessage');
const myReportsLink = document.getElementById('myReportsLink');
const homeMatchesLink = document.getElementById('homeMatchesLink');
const matchMessage = document.getElementById('matchMessage');

let currentUser = null;

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
        ? '날짜 정보 없음'
        : date.toLocaleDateString('ko-KR');
}

// 카테고리별 이미지 대체 표시
function getCategoryStyle(category) {
    const styles = {
        '지갑': ['clay', '▣'],
        '전자기기': ['sage', '◉'],
        '열쇠': ['sand', '◇'],
        '우산': ['sage', '☂']
    };

    return styles[category] || ['sand', '◇'];
}

// 최근 습득물 카드 생성
function createFoundCard(report) {

    const card = createElement('a', 'found-card');

    card.href =
        `./report-detail.html?id=${encodeURIComponent(report.report_id)}`;

    const [color, symbol] =
        getCategoryStyle(report.category);

    const illustration = createElement(
        'div',
        `item-illustration ${color}`
    );

    illustration.appendChild(
        createElement('span', 'item-symbol', symbol)
    );

    illustration.appendChild(
        createElement('span', '', report.category)
    );

    // 등록된 사진이 있다면 실제 사진 표시
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
                image.loading = 'lazy';
                image.style.width = '100%';
                image.style.height = '150px';
                image.style.objectFit = 'cover';

                image.addEventListener('load', () => {
                    illustration.replaceChildren(image);
                });
            }

        } catch {
            // 잘못된 사진 주소는 기본 아이콘으로 대체
        }
    }

    card.appendChild(illustration);

    const info = createElement('div', 'found-info');

    info.appendChild(
        createElement(
            'span',
            'status status-received',
            statusLabels[report.status] || report.status
        )
    );

    info.appendChild(
        createElement('b', '', report.item_name)
    );

    info.appendChild(
        createElement('span', '', report.place)
    );

    info.appendChild(
        createElement(
            'span',
            '',
            `${formatDate(report.occurred_at)} 습득`
        )
    );

    card.appendChild(info);

    return card;
}

// 최근 습득물 조회
async function loadRecentFoundReports() {

    foundGrid.replaceChildren();

    try {
        const data = await api(
            '/api/discovery/reports?reportType=FOUND&limit=3'
        );

        if (data.items.length === 0) {

            emptyState.textContent =
                '등록된 습득물이 아직 없어요.';

            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;

        for (const report of data.items) {
            foundGrid.appendChild(
                createFoundCard(report)
            );
        }

    } catch (error) {

        emptyState.textContent = error.message;
        emptyState.hidden = false;
    }
}

// 실제 스마트 매칭 결과 조회
async function loadSmartMatches() {

    matchMessage.textContent =
        '유사 물품을 확인하는 중입니다.';

    homeMatchesLink.href = './matches.html';
    homeMatchesLink.textContent = '유사 물품 확인하기';

    try {

        const data = await api(
            '/api/discovery/matches?page=1&limit=1'
        );

        if (data.total === 0) {

            matchMessage.textContent =
                '아직 매칭된 물품이 없어요. 내 신고를 선택해 유사 물품을 찾아보세요.';

            homeMatchesLink.textContent =
                '유사 물품 찾기';

            return;
        }

        const bestMatch = data.items[0];

        const score = bestMatch.similarity === null
            ? '유사도 미산정'
            : `유사도 ${Math.round(bestMatch.similarity * 100)}%`;

        matchMessage.replaceChildren();

        const count = createElement(
            'p',
            'home-match-count',
            `총 ${data.total}개의 매칭 결과가 있어요!`
        );

        const title = createElement(
            'strong',
            'home-match-title',
            `${bestMatch.lost.item_name} ↔ ${bestMatch.found.item_name}`
        );

        const similarity = createElement(
            'p',
            'home-match-score',
            score
        );

        const place = createElement(
            'p',
            'home-match-place',
            `습득 장소: ${bestMatch.found.place}`
        );

        matchMessage.append(
            count,
            title,
            similarity,
            place
        );

        homeMatchesLink.textContent =
            `매칭 결과 ${data.total}개 확인하기`;

    } catch (error) {

        if (error.status === 401) {

            matchMessage.textContent =
                '로그인 후 유사 물품을 확인할 수 있어요.';

            homeMatchesLink.href =
                '/features/account/frontend/login.html';

            homeMatchesLink.textContent = '로그인하기';

        } else {

            matchMessage.textContent =
                '매칭 결과를 불러오지 못했습니다. 다시 확인해 주세요.';
        }
    }
}

// 관리자 전용 메뉴 표시
function renderAdminMenu() {

    const existingMenu =
        document.getElementById('adminMenu');

    if (existingMenu) {
        existingMenu.remove();
    }

    // 관리자 계정에서만 메뉴 생성
    if (currentUser?.role !== 'ADMIN') {
        return;
    }

    const sideColumn =
        document.querySelector('.side-column');

    if (!sideColumn) return;

    const menu = createElement(
        'article',
        'my-reports'
    );

    menu.id = 'adminMenu';

    const heading = createElement(
        'div',
        'card-heading'
    );

    heading.appendChild(
        createElement('h3', '', '관리자 메뉴')
    );

    menu.appendChild(heading);

    const links = createElement(
        'div',
        'report-list'
    );

    const description = createElement(
        'p',
        '',
        '사용자·신고·매칭·인계·보관·통계를 관리합니다.'
    );

    links.appendChild(description);

    const adminPages = [
        ['사용자 관리 →', '/features/account/frontend/admin-users.html'],
        ['신고 관리 →', '/features/reports/frontend/admin-reports.html'],
        ['매칭 관리 →', '/features/discovery/frontend/admin-matches.html'],
        ['인계 신청 관리 →', '/features/operations/frontend/admin-handovers.html'],
        ['보관·폐기 관리 →', '/features/operations/frontend/admin-storage.html'],
        ['통계 대시보드 →', '/features/discovery/frontend/admin-stats.html']
    ];

    for (const [label, href] of adminPages) {
        const anchor = createElement('a', 'btn btn-secondary full', label);
        anchor.href = href;
        const row = createElement('p');
        row.appendChild(anchor);
        links.appendChild(row);
    }

    menu.appendChild(links);

    sideColumn.appendChild(menu);
}

// 메인 검색창과 검색 페이지 연결
searchForm.addEventListener('submit', (event) => {

    event.preventDefault();

    const keyword = searchInput.value.trim();

    const params = new URLSearchParams();

    if (keyword) {
        params.set('q', keyword);
    }

    window.location.href =
        `./search.html?${params.toString()}`;
});

// 로그인 상태 확인
async function loadCurrentUser() {

    try {
        currentUser = await api('/api/account/me');

        loginLink.textContent = '로그아웃';

        myReportMessage.textContent =
            `${currentUser.name}님의 신고 내역을 확인해 보세요.`;

        myReportsLink.textContent = '내 신고 내역 보기 →';

        myReportsLink.href =
            '/features/reports/frontend/my-reports.html';

        let handoverStatusLink =
            document.getElementById('myHandoversLink');

        if (!handoverStatusLink) {
            handoverStatusLink = createElement(
                'a',
                '',
                '내 인계 신청 현황 →'
            );
            handoverStatusLink.id = 'myHandoversLink';
            handoverStatusLink.href =
                '/features/operations/frontend/handover-status.html';
            const row = createElement('p');
            row.appendChild(handoverStatusLink);
            myReportsLink.parentElement.appendChild(row);
        }

        // 관리자 권한에 따른 메뉴 표시
        renderAdminMenu();

        // 실제 스마트 매칭 결과 표시
        await loadSmartMatches();

    } catch (error) {

        currentUser = null;

        document.getElementById('myHandoversLink')?.parentElement?.remove();

        renderAdminMenu();

        if (error.status !== 401) {

            myReportMessage.textContent =
                '로그인 정보를 확인할 수 없습니다.';

            matchMessage.textContent =
                '매칭 정보를 확인할 수 없습니다.';

            return;
        }

        loginLink.textContent = '로그인';

        myReportMessage.textContent =
            '로그인 후 내 신고 내역을 확인할 수 있습니다.';

        homeMatchesLink.href =
            '/features/account/frontend/login.html';

        homeMatchesLink.textContent = '로그인하기';

        matchMessage.textContent =
            '로그인하면 유사한 습득물을 확인할 수 있어요.';
    }
}

// 로그인 및 로그아웃
loginLink.addEventListener('click', async (event) => {

    if (!currentUser) return;

    event.preventDefault();

    try {
        await api('/api/account/logout', {
            method: 'POST',
            body: {}
        });

        window.location.reload();

    } catch (error) {
        alert(error.message);
    }
});

// 실제 알림 페이지 이동
notificationButton.addEventListener('click', () => {

    window.location.href = currentUser
        ? '/features/account/frontend/notifications.html'
        : '/features/account/frontend/login.html';
});

// 최초 화면 실행
loadCurrentUser();
loadRecentFoundReports();

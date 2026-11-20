
import { api } from '../../../../shared/frontend/js/api.js';

const message = document.getElementById('message');
const reportDetail = document.getElementById('reportDetail');

const params = new URLSearchParams(window.location.search);
const reportId = params.get('id');

// 신고 상태 한글 변환
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

// 화면에 텍스트 출력
function setText(id, value) {
    document.getElementById(id).textContent = value;
}

// 날짜 표시 형식 변환
function formatDate(value) {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? '정보 없음'
        : date.toLocaleString('ko-KR');
}

// 등록된 사진 출력
function renderPhotos(photos, itemName) {
    const container = document.getElementById('reportPhotos');

    container.replaceChildren();

    let displayed = 0;

    for (const photo of photos) {
        try {
            const url = new URL(
                photo.photo_url,
                window.location.origin
            );

            if (url.origin !== window.location.origin) {
                continue;
            }

            const image = document.createElement('img');

            image.src = url.href;
            image.alt = itemName;
            image.width = 240;
            image.loading = 'lazy';

            container.appendChild(image);
            displayed++;

        } catch {
            // 잘못된 사진 주소는 표시하지 않음
        }
    }

    if (displayed === 0) {
        container.textContent = '등록된 사진이 없습니다.';
    }
}

// 신고 상세 정보 조회
async function loadReport() {

    if (
        !reportId ||
        !/^[1-9]\d*$/.test(reportId) ||
        !Number.isSafeInteger(Number(reportId))
    ) {
        message.textContent = '잘못된 신고 정보입니다.';
        return;
    }

    message.textContent = '물품 정보를 불러오는 중입니다...';

    try {
        const report = await api(
            `/api/discovery/reports/${reportId}`
        );

        setText(
            'reportType',
            report.report_type === 'LOST'
                ? '분실물'
                : '습득물'
        );

        setText('itemName', report.item_name);
        setText('category', report.category);
        setText('place', report.place);

        setText(
            'occurredAt',
            formatDate(report.occurred_at)
        );

        setText(
            'description',
            report.description || '등록된 특징이 없습니다.'
        );

        setText(
            'status',
            statusLabels[report.status] || report.status
        );

        setText(
            'createdAt',
            formatDate(report.created_at)
        );

        renderPhotos(report.photos, report.item_name);

        // 유사 물품 매칭 페이지 연결
        document.getElementById('matchesLink').href =
            `./matches.html?reportId=${reportId}`;

        // 습득물인 경우 인계 신청 페이지 연결
        const handoverLink =
            document.getElementById('handoverLink');

        const availableStatuses = [
            'REPORTED',
            'RECEIVED',
            'STORED',
            'MATCHED'
        ];

        if (
            report.report_type === 'FOUND' &&
            availableStatuses.includes(report.status)
        ) {
            handoverLink.href =
                `/features/operations/frontend/handover-apply.html?foundReportId=${reportId}`;

            handoverLink.hidden = false;
        }

        message.textContent = '';
        reportDetail.hidden = false;

    } catch (error) {
        message.textContent = error.message;
        reportDetail.hidden = true;
    }
}

loadReport();

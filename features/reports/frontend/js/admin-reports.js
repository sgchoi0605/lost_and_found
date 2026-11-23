// [B] 관리자 신고 조회와 상태 변경을 처리합니다.

import { showToast } from '../../../../shared/frontend/js/toast.js';
// 추후 백엔드 API 및 관리자 권한 확인 연동 시 아래 모듈을 사용합니다.
// import { api } from '../../../../shared/frontend/js/api.js';
// import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';

const listContainer = document.querySelector('#adminReportList');
const statusFilter = document.querySelector('#statusFilter');

// 상태 코드에 따른 표시 문구와 공통 CSS 클래스를 매핑합니다.
const STATUS_MAP = {
  received: { label: '접수됨', className: 'status-received' },
  matching: { label: '매칭 중', className: 'status-matching' },
  ready: { label: '인계 완료', className: 'status-ready' },
};

// 화면 구성 확인용 임시 신고 목록입니다.
let allReports = [
  {
    id: 1,
    type: '분실물',
    itemName: '브라운 카드 지갑',
    place: '상도동',
    date: '2026-11-15',
    reporter: '김민수',
    status: 'matching',
  },
  {
    id: 2,
    type: '습득물',
    itemName: '검정색 에어팟 프로',
    place: '사당동',
    date: '2026-11-18',
    reporter: '이서연',
    status: 'received',
  },
  {
    id: 3,
    type: '분실물',
    itemName: '검정색 우산',
    place: '노량진동',
    date: '2026-11-10',
    reporter: '박지훈',
    status: 'ready',
  },
];

// 선택된 필터 조건에 맞춰 신고 목록을 화면에 렌더링합니다.
function renderReports() {
  const filterValue = statusFilter.value;
  const filtered =
    filterValue === 'all'
      ? allReports
      : allReports.filter((item) => item.status === filterValue);

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div class="empty-state">조건에 해당하는 신고 내역이 없습니다.</div>';
    return;
  }

  listContainer.innerHTML = filtered
    .map((report) => {
      const status = STATUS_MAP[report.status] || STATUS_MAP.received;
      return `
        <article class="my-report-item">
          <div class="my-report-info">
            <div class="my-report-meta">
              <span class="status ${status.className}">${status.label}</span>
              <small>${report.type} · ${report.place} · ${report.date} · 신고자: ${report.reporter}</small>
            </div>
            <b>${report.itemName}</b>
          </div>
          <div class="my-report-actions">
            <select class="status-select" data-status-id="${report.id}" aria-label="진행 상태 변경">
              <option value="received" ${report.status === 'received' ? 'selected' : ''}>접수됨</option>
              <option value="matching" ${report.status === 'matching' ? 'selected' : ''}>매칭 중</option>
              <option value="ready" ${report.status === 'ready' ? 'selected' : ''}>인계 완료</option>
            </select>
            <button class="btn btn-secondary" type="button" data-delete-id="${report.id}">삭제</button>
          </div>
        </article>
      `;
    })
    .join('');
}

// 필터 변경 시 목록을 다시 렌더링합니다.
statusFilter.addEventListener('change', renderReports);

// 개별 신고의 진행 상태 변경 이벤트를 처리합니다.
listContainer.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-status-id]');
  if (!select) return;

  const targetId = Number(select.dataset.statusId);
  const nextStatus = select.value;

  // 추후 서버 연동 시 상태 변경 API를 호출합니다.
  // await api(`/api/admin/reports/${targetId}/status`, { method: 'PATCH', body: { status: nextStatus } });

  const target = allReports.find((item) => item.id === targetId);
  if (target) {
    target.status = nextStatus;
  }

  renderReports();
  showToast(`신고 상태가 '${STATUS_MAP[nextStatus].label}'(으)로 변경되었습니다.`);
});

// 삭제 버튼 클릭 시 확인 후 신고 내역을 제거합니다.
listContainer.addEventListener('click', async (event) => {
  const deleteBtn = event.target.closest('[data-delete-id]');
  if (!deleteBtn) return;

  const targetId = Number(deleteBtn.dataset.deleteId);
  if (!window.confirm('이 신고 내역을 삭제하시겠습니까?')) return;

  // 추후 서버 연동 시 관리자 삭제 API를 호출합니다.
  // await api(`/api/admin/reports/${targetId}`, { method: 'DELETE' });

  allReports = allReports.filter((item) => item.id !== targetId);
  renderReports();
  showToast('신고 내역이 삭제되었습니다.');
});

// 초기 화면 진입 시 목록을 표시합니다.
renderReports();
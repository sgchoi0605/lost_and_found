// [B] 본인 신고 목록과 진행 상태를 화면에 표시합니다.

import { showToast } from '../../../../shared/frontend/js/toast.js';
// 추후 백엔드 API 및 로그인 확인 연동 시 아래 모듈을 사용합니다.
// import { api } from '../../../../shared/frontend/js/api.js';
// import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';

const listContainer = document.querySelector('#myReportList');

// 상태 코드에 따른 표시 문구와 공통 CSS 클래스를 매핑합니다.
const STATUS_MAP = {
  received: { label: '접수됨', className: 'status-received' },
  matching: { label: '매칭 중', className: 'status-matching' },
  ready: { label: '인계 완료', className: 'status-ready' },
};

// 서버 연동 전 화면 확인용 임시 신고 목록 데이터입니다.
let myReports = [
  {
    id: 1,
    type: '분실물',
    itemName: '브라운 카드 지갑',
    place: '상도동',
    date: '2026-11-15',
    status: 'matching',
  },
  {
    id: 2,
    type: '습득물',
    itemName: '검정색 에어팟 프로',
    place: '사당동',
    date: '2026-11-18',
    status: 'received',
  },
  {
    id: 3,
    type: '분실물',
    itemName: '검정색 우산',
    place: '노량진동',
    date: '2026-11-10',
    status: 'ready',
  },
];

// 신고 목록 배열을 읽어 화면에 렌더링합니다.
function renderReports() {
  if (myReports.length === 0) {
    listContainer.innerHTML = '<div class="empty-state">등록된 신고 내역이 없습니다.</div>';
    return;
  }

  listContainer.innerHTML = myReports
    .map((report) => {
      const status = STATUS_MAP[report.status] || STATUS_MAP.received;
      return `
        <article class="my-report-item">
          <div class="my-report-info">
            <div class="my-report-meta">
              <span class="status ${status.className}">${status.label}</span>
              <small>${report.type} · ${report.place} · ${report.date}</small>
            </div>
            <b>${report.itemName}</b>
          </div>
          <div class="my-report-actions">
            <a class="btn btn-secondary" href="./report-edit.html?id=${report.id}">수정</a>
            <button class="btn btn-secondary" type="button" data-delete-id="${report.id}">삭제</button>
          </div>
        </article>
      `;
    })
    .join('');
}

// 삭제 버튼 클릭 이벤트를 처리합니다.
listContainer.addEventListener('click', async (event) => {
  const deleteBtn = event.target.closest('[data-delete-id]');
  if (!deleteBtn) return;

  const targetId = Number(deleteBtn.dataset.deleteId);
  if (!window.confirm('이 신고 내역을 삭제하시겠습니까?')) return;

  // 추후 서버 연동 시 삭제 API를 호출합니다.
  // await api(`/api/reports/${targetId}`, { method: 'DELETE' });

  myReports = myReports.filter((item) => item.id !== targetId);
  renderReports();
  showToast('신고 내역이 삭제되었습니다.');
});

// 초기 화면 진입 시 목록을 표시합니다.
renderReports();
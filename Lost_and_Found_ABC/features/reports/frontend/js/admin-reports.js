import { createPagination } from './pagination.js';
// [B] 관리자 전체 신고 목록 조회·상태 변경·삭제 API(/api/reports/admin)를 처리합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  REPORT_STATUS_LIST,
  REPORT_STATUS_MAP,
  REPORT_TYPE_LABELS,
  formatDateOnly,
  renderEmptyMessage,
} from './reports-common.js';

const listContainer = document.querySelector('#adminReportList');
const pager = createPagination(listContainer, loadAdminReports);
let loadVersion = 0;
const statusFilter = document.querySelector('#statusFilter');

// 관리자용 신고 1건 카드를 DOM 요소와 textContent로 안전하게 생성합니다.
function createAdminReportCard(report) {
  const statusInfo = REPORT_STATUS_MAP[report.status] || {
    label: report.status,
    className: 'status-received',
  };
  const typeLabel = REPORT_TYPE_LABELS[report.report_type] || report.report_type;

  const article = document.createElement('article');
  article.className = 'my-report-item';

  const info = document.createElement('div');
  info.className = 'my-report-info';

  const meta = document.createElement('div');
  meta.className = 'my-report-meta';

  const badge = document.createElement('span');
  badge.className = `status ${statusInfo.className}`;
  badge.textContent = statusInfo.label;

  const reporterLabel = report.author_name || report.author_login_id || `사용자 #${report.author_id}`;
  const summary = document.createElement('small');
  summary.textContent = `${typeLabel} · ${report.place} · ${formatDateOnly(report.occurred_at)} · 신고자: ${reporterLabel}`;
  meta.append(badge, summary);

  const title = document.createElement('b');
  title.textContent = report.item_name;
  info.append(meta, title);

  const actions = document.createElement('div');
  actions.className = 'my-report-actions';

  const select = document.createElement('select');
  select.className = 'status-select';
  select.dataset.statusId = String(report.report_id);
  select.dataset.currentStatus = report.status;
  select.setAttribute('aria-label', '진행 상태 변경');

  const nextStatuses = report.status === 'REPORTED' ? ['RECEIVED'] : report.status === 'RECEIVED' && report.report_type === 'FOUND' ? ['STORED'] : [];
  select.disabled = nextStatuses.length === 0;
  for (const item of REPORT_STATUS_LIST.filter((item) => item.value === report.status || nextStatuses.includes(item.value))) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === report.status;
    select.append(option);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-secondary';
  deleteBtn.type = 'button';
  deleteBtn.dataset.deleteId = String(report.report_id);
  deleteBtn.textContent = '삭제';

  actions.append(select, deleteBtn);
  article.append(info, actions);
  return article;
}

// 선택한 필터 조건으로 서버에서 전체 신고 목록을 조회합니다.
async function loadAdminReports() {
  const version = ++loadVersion;
  pager.loading();
  renderEmptyMessage(listContainer, '신고 목록을 불러오는 중입니다...');
  const params = new URLSearchParams({ page: String(pager.page), limit: '20', q: document.querySelector('#reportQuery').value.trim() });
  if (statusFilter.value !== 'all') {
    params.set('status', statusFilter.value);
  }

  try {
    const result = await api(`/api/reports/admin?${params.toString()}`);
    if (version !== loadVersion) return;
    pager.update(result);
    if (result.items.length === 0) {
      renderEmptyMessage(listContainer, '조건에 해당하는 신고 내역이 없습니다.');
      return;
    }
    listContainer.replaceChildren(...result.items.map(createAdminReportCard));
  } catch (error) {
    if (version !== loadVersion) return;
    pager.error();
    renderEmptyMessage(listContainer, error.message);
    showToast(error.message);
  }
}

// 관리자 권한 확인 후 목록 조회 및 이벤트를 연결합니다.
async function init() {
  const user = await requireUser({ admin: true });
  if (!user) {
    return;
  }

  statusFilter.addEventListener('change', () => { pager.reset(); loadAdminReports(); });
  document.querySelector('#adminSearchForm').addEventListener('submit', (event) => { event.preventDefault(); pager.reset(); loadAdminReports(); });

  listContainer.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-status-id]');
    if (!select) {
      return;
    }

    const reportId = select.dataset.statusId;
    const prevStatus = select.dataset.currentStatus;
    const nextStatus = select.value;
    select.disabled = true;

    try {
      await api(`/api/reports/admin/${reportId}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      const label = REPORT_STATUS_MAP[nextStatus]?.label || nextStatus;
      showToast(`신고 상태가 '${label}'(으)로 변경되었습니다.`);
      await loadAdminReports();
    } catch (error) {
      select.value = prevStatus;
      select.disabled = false;
      showToast(error.message);
    }
  });

  listContainer.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('[data-delete-id]');
    if (!deleteBtn) {
      return;
    }

    const reportId = deleteBtn.dataset.deleteId;
    if (!window.confirm('이 신고 내역을 삭제하시겠습니까?')) {
      return;
    }

    deleteBtn.disabled = true;
    try {
      await api(`/api/reports/admin/${reportId}`, { method: 'DELETE', body: {} });
      showToast('신고 내역이 삭제되었습니다.');
      await loadAdminReports();
    } catch (error) {
      showToast(error.message);
      deleteBtn.disabled = false;
    }
  });

  await loadAdminReports();
}

init();

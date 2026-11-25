import { createPagination } from './pagination.js';
// [B] 로그인 사용자의 본인 신고 목록 조회(/api/reports/mine)와 삭제를 처리합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  REPORT_STATUS_MAP,
  REPORT_TYPE_LABELS,
  formatDateOnly,
  renderEmptyMessage,
} from './reports-common.js';

const listContainer = document.querySelector('#myReportList');
const pager = createPagination(listContainer, loadMyReports);
let loadVersion = 0;

// 신고 1건 카드를 DOM 요소와 textContent로 안전하게 생성합니다.
function createReportCard(report) {
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

  const summary = document.createElement('small');
  summary.textContent = `${typeLabel} · ${report.place} · ${formatDateOnly(report.occurred_at)}`;
  meta.append(badge, summary);

  const title = document.createElement('b');
  title.textContent = report.item_name;
  info.append(meta, title);

  const actions = document.createElement('div');
  actions.className = 'my-report-actions';

  const detailLink = document.createElement('a');
  detailLink.className = 'btn btn-secondary';
  detailLink.href = `/features/discovery/frontend/report-detail.html?id=${report.report_id}`;
  detailLink.textContent = '상세';

  const editLink = document.createElement('a');
  editLink.className = 'btn btn-secondary';
  editLink.href = `./report-edit.html?id=${report.report_id}`;
  editLink.textContent = '수정';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-secondary';
  deleteBtn.type = 'button';
  deleteBtn.dataset.deleteId = String(report.report_id);
  deleteBtn.textContent = '삭제';

  actions.append(detailLink, editLink, deleteBtn);
  article.append(info, actions);
  return article;
}

// 서버에서 본인 신고 목록을 불러와 화면에 표시합니다.
async function loadMyReports() {
  const version = ++loadVersion;
  pager.loading();
  renderEmptyMessage(listContainer, '신고 내역을 불러오는 중입니다...');
  try {
    const result = await api(`/api/reports/mine?page=${pager.page}&limit=20`);
    if (version !== loadVersion) return;
    pager.update(result);
    if (result.items.length === 0) {
      renderEmptyMessage(listContainer, '등록된 신고 내역이 없습니다.');
      return;
    }
    listContainer.replaceChildren(...result.items.map(createReportCard));
  } catch (error) {
    if (version !== loadVersion) return;
    pager.error();
    renderEmptyMessage(listContainer, error.message);
    showToast(error.message);
  }
}

// 삭제 버튼 클릭 시 확인 후 서버에 논리 삭제를 요청합니다.
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
    await api(`/api/reports/${reportId}`, { method: 'DELETE', body: {} });
    showToast('신고 내역이 삭제되었습니다.');
    await loadMyReports();
  } catch (error) {
    showToast(error.message);
    deleteBtn.disabled = false;
  }
});

// 로그인 확인 후 본인 신고 목록을 불러옵니다.
async function init() {
  const user = await requireUser();
  if (!user) {
    return;
  }
  await loadMyReports();
}

init();

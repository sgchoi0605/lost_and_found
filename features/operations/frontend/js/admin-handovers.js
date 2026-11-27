// [D] 관리자 전체 인계 신청 목록 API(/api/operations/admin/handovers)를 조회·표시합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  HANDOVER_STATUS_MAP,
  createBadge,
  formatDateTime,
  setMessage,
} from './operations-common.js';

const main = document.querySelector('main');
const allCount = document.getElementById('all-count');
const waitingCount = document.getElementById('waiting-count');
const approvedCount = document.getElementById('approved-count');
const completedCount = document.getElementById('completed-count');

const filterForm = document.getElementById('filter-form');
const searchInput = document.getElementById('handover-search');
const filterSelect = document.getElementById('handover-filter');
const listMessage = document.getElementById('list-message');
const tableBody = document.getElementById('handovers-table-body');
const emptyMessage = document.getElementById('handovers-empty-message');
const pagination = document.getElementById('pagination');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const pageInfo = document.getElementById('page-info');

let currentPage = 1;
let totalPages = 1;
let loadVersion = 0;

function createRow(item) {
  const row = document.createElement('tr');

  const idCell = document.createElement('td');
  idCell.textContent = `#${item.request_id}`;

  const itemCell = document.createElement('td');
  itemCell.textContent = item.found_item_name || '물품명 없음';

  const applicantCell = document.createElement('td');
  applicantCell.textContent = `${item.requester_name} (${item.requester_login_id})`;

  const dateCell = document.createElement('td');
  dateCell.textContent = formatDateTime(item.created_at);

  const statusCell = document.createElement('td');
  const statusInfo = HANDOVER_STATUS_MAP[item.status] || {
    label: item.status,
    badgeClass: 'ops-badge-closed',
  };
  statusCell.appendChild(createBadge(statusInfo.label, statusInfo.badgeClass));

  const actionCell = document.createElement('td');
  const detailLink = document.createElement('a');
  detailLink.href = `./admin-handover-detail.html?id=${encodeURIComponent(item.request_id)}`;
  detailLink.textContent = '상세 처리';
  actionCell.appendChild(detailLink);

  row.append(idCell, itemCell, applicantCell, dateCell, statusCell, actionCell);
  return row;
}

async function loadAdminHandovers(page = 1) {
  const version = ++loadVersion;
  setMessage(listMessage, '인계 신청 목록을 불러오는 중입니다...');
  tableBody.replaceChildren();
  emptyMessage.hidden = true;
  pagination.hidden = true;

  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    q: searchInput.value.trim(),
  });
  if (filterSelect.value !== 'all') {
    params.set('status', filterSelect.value);
  }

  try {
    const data = await api(`/api/operations/admin/handovers?${params.toString()}`);
    if (version !== loadVersion) {
      return;
    }
    setMessage(listMessage, '');

    const summary = data.summary || {};
    allCount.textContent = String(summary.total ?? 0);
    waitingCount.textContent = String((summary.requested ?? 0) + (summary.underReview ?? 0));
    approvedCount.textContent = String(summary.approved ?? 0);
    completedCount.textContent = String(summary.completed ?? 0);

    currentPage = data.page;
    totalPages = Math.max(1, Math.ceil(data.total / data.limit));

    if (data.items.length === 0) {
      emptyMessage.hidden = false;
      return;
    }

    for (const item of data.items) {
      tableBody.appendChild(createRow(item));
    }

    pageInfo.textContent = `${currentPage} / ${totalPages} (총 ${data.total}건)`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    pagination.hidden = false;
  } catch (error) {
    if (version !== loadVersion) {
      return;
    }
    setMessage(listMessage, error.message, 'error');
    showToast(error.message);
  }
}

async function init() {
  const admin = await requireUser({ admin: true });
  if (!admin) {
    return;
  }
  main.hidden = false;

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadAdminHandovers(1);
  });
  filterSelect.addEventListener('change', () => loadAdminHandovers(1));
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      loadAdminHandovers(currentPage - 1);
    }
  });
  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadAdminHandovers(currentPage + 1);
    }
  });

  await loadAdminHandovers(1);
}

init();

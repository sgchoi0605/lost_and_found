// [D] 로그인 사용자의 본인 인계 신청 목록 API(/api/operations/handovers/mine)를 표시합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  HANDOVER_STATUS_MAP,
  createBadge,
  extractContactAndProof,
  formatDateTime,
  setMessage,
} from './operations-common.js';

const main = document.querySelector('main');
const statusFilter = document.getElementById('status-filter');
const refreshButton = document.getElementById('refresh-button');
const statusMessage = document.getElementById('status-message');
const handoverList = document.getElementById('handover-list');
const emptyMessage = document.getElementById('empty-message');
const pagination = document.getElementById('pagination');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const pageInfo = document.getElementById('page-info');

let currentPage = 1;
let totalPages = 1;
let loadVersion = 0;

function appendDetailRow(container, label, value) {
  const row = document.createElement('div');
  row.className = 'ops-detail-row';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const valueEl = document.createElement('p');
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  container.appendChild(row);
}

function createHandoverCard(item) {
  const card = document.createElement('article');
  card.className = 'ops-status-card';

  const head = document.createElement('div');
  head.className = 'ops-status-card-head';

  const titleLink = document.createElement('a');
  titleLink.href = `/features/discovery/frontend/report-detail.html?id=${encodeURIComponent(item.found_report_id)}`;
  titleLink.textContent = `#${item.request_id} · ${item.found_item_name}`;

  const statusInfo = HANDOVER_STATUS_MAP[item.status] || {
    label: item.status,
    badgeClass: 'ops-badge-closed',
  };
  head.append(titleLink, createBadge(statusInfo.label, statusInfo.badgeClass));

  const body = document.createElement('div');
  body.className = 'ops-detail-list';

  const { contact, proof } = extractContactAndProof(item.ownership_proof);
  appendDetailRow(body, '신청 일시', formatDateTime(item.created_at));
  appendDetailRow(body, '습득 장소 / 일시', `${item.found_place} (${formatDateTime(item.found_occurred_at)})`);
  appendDetailRow(
    body,
    '보관 장소',
    item.record_storage_place || item.found_storage_place || '미등록',
  );
  if (contact) {
    appendDetailRow(body, '연락처', contact);
  }
  appendDetailRow(body, '소유 증명 내용', proof || '없음');

  if (item.review_note) {
    appendDetailRow(body, '관리자 검토 메모', item.review_note);
  }
  if (item.reviewed_at) {
    appendDetailRow(body, '검토 일시', formatDateTime(item.reviewed_at));
  }
  if (item.status === 'COMPLETED') {
    appendDetailRow(body, '실제 수령자', item.recipient_name || '정보 없음');
    appendDetailRow(body, '인계 완료 일시', formatDateTime(item.completed_at));
  }

  card.append(head, body);
  return card;
}

async function loadHandovers(page = 1) {
  const version = ++loadVersion;
  setMessage(statusMessage, '인계 신청 현황을 불러오는 중입니다...');
  handoverList.replaceChildren();
  emptyMessage.hidden = true;
  pagination.hidden = true;

  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (statusFilter.value !== 'all') {
    params.set('status', statusFilter.value);
  }

  try {
    const data = await api(`/api/operations/handovers/mine?${params.toString()}`);
    if (version !== loadVersion) {
      return;
    }
    setMessage(statusMessage, '');

    currentPage = data.page;
    totalPages = Math.max(1, Math.ceil(data.total / data.limit));

    if (data.items.length === 0) {
      emptyMessage.hidden = false;
      return;
    }

    for (const item of data.items) {
      handoverList.appendChild(createHandoverCard(item));
    }

    pageInfo.textContent = `${currentPage} / ${totalPages} (총 ${data.total}건)`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    pagination.hidden = false;
  } catch (error) {
    if (version !== loadVersion) {
      return;
    }
    setMessage(statusMessage, error.message, 'error');
    showToast(error.message);
  }
}

async function init() {
  const user = await requireUser();
  if (!user) {
    return;
  }
  main.hidden = false;

  statusFilter.addEventListener('change', () => loadHandovers(1));
  refreshButton.addEventListener('click', () => loadHandovers(currentPage));
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      loadHandovers(currentPage - 1);
    }
  });
  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadHandovers(currentPage + 1);
    }
  });

  await loadHandovers(1);
}

init();

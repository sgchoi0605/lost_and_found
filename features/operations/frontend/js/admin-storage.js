// [D] 관리자 보관 접수·목록·기한 점검·보관 수정·폐기·이관 API를 처리합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  RETENTION_STATE_MAP,
  STORAGE_STATUS_MAP,
  createBadge,
  formatDateOnly,
  setMessage,
  toDateInputValue,
} from './operations-common.js';

const main = document.querySelector('main');
const totalCount = document.getElementById('total-count');
const storedCount = document.getElementById('stored-count');
const expiringCount = document.getElementById('expiring-count');
const expiredCount = document.getElementById('expired-count');
const closedCount = document.getElementById('closed-count');

const intakeForm = document.getElementById('intake-form');
const candidateSelect = document.getElementById('candidate-select');
const intakePlace = document.getElementById('intake-place');
const intakeDays = document.getElementById('intake-days');
const intakeDeadline = document.getElementById('intake-deadline');
const intakeSubmit = document.getElementById('intake-submit');
const checkRetentionButton = document.getElementById('check-retention-button');
const intakeMessage = document.getElementById('intake-message');

const actionPanel = document.getElementById('action-panel');
const actionPanelTitle = document.getElementById('action-panel-title');
const actionPanelTarget = document.getElementById('action-panel-target');
const actionPanelMessage = document.getElementById('action-panel-message');
const editStorageForm = document.getElementById('edit-storage-form');
const editStoragePlace = document.getElementById('edit-storage-place');
const editStorageDeadline = document.getElementById('edit-storage-deadline');
const cancelEditButton = document.getElementById('cancel-edit-button');
const disposeStorageForm = document.getElementById('dispose-storage-form');
const disposeStatus = document.getElementById('dispose-status');
const disposeNote = document.getElementById('dispose-note');
const cancelDisposeButton = document.getElementById('cancel-dispose-button');

const storageFilterForm = document.getElementById('storage-filter-form');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const retentionFilter = document.getElementById('retention-filter');
const storageMessage = document.getElementById('storage-message');
const tableBody = document.getElementById('storage-table-body');
const emptyMessage = document.getElementById('empty-message');
const pagination = document.getElementById('pagination');
const prevButton = document.getElementById('prev-button');
const nextButton = document.getElementById('next-button');
const pageInfo = document.getElementById('page-info');

const highlightStorageId = new URLSearchParams(window.location.search).get('storageId');

const candidatesById = new Map();
let activeStorage = null;
let currentPage = 1;
let totalPages = 1;
let loadVersion = 0;

function closeActionPanel() {
  activeStorage = null;
  actionPanel.hidden = true;
  editStorageForm.hidden = true;
  disposeStorageForm.hidden = true;
  setMessage(actionPanelMessage, '');
}

function openEditPanel(item) {
  activeStorage = item;
  actionPanelTitle.textContent = '보관 정보 수정';
  actionPanelTarget.textContent = `대상: #${item.storage_id} ${item.item_name} (습득 신고 #${item.found_report_id})`;
  editStoragePlace.value = item.storage_place || '';
  editStorageDeadline.value = toDateInputValue(item.storage_deadline);
  editStorageForm.hidden = false;
  disposeStorageForm.hidden = true;
  actionPanel.hidden = false;
  setMessage(actionPanelMessage, '');
  actionPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function openDisposePanel(item) {
  activeStorage = item;
  actionPanelTitle.textContent = '보관 물품 폐기·이관 처리';
  actionPanelTarget.textContent = `대상: #${item.storage_id} ${item.item_name} (보관 기한: ${formatDateOnly(item.storage_deadline)})`;
  disposeStatus.value = 'DISPOSED';
  disposeNote.value = '';
  editStorageForm.hidden = true;
  disposeStorageForm.hidden = false;
  actionPanel.hidden = false;
  setMessage(actionPanelMessage, '');
  actionPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatRetentionLabel(item) {
  const info = RETENTION_STATE_MAP[item.retention_state] || {
    label: item.retention_state || '정보 없음',
    badgeClass: 'ops-badge-closed',
  };
  if (item.retention_state === 'EXPIRED' && typeof item.days_remaining === 'number') {
    return { label: `${info.label} (${Math.abs(item.days_remaining)}일 경과)`, badgeClass: info.badgeClass };
  }
  if (
    (item.retention_state === 'EXPIRING_SOON' || item.retention_state === 'NORMAL') &&
    typeof item.days_remaining === 'number'
  ) {
    return { label: `${info.label} (D-${item.days_remaining})`, badgeClass: info.badgeClass };
  }
  return info;
}

function createStorageRow(item) {
  const row = document.createElement('tr');
  if (highlightStorageId && String(item.storage_id) === String(highlightStorageId)) {
    row.className = 'ops-row-highlight';
  }

  const nameCell = document.createElement('td');
  const link = document.createElement('a');
  link.href = `/features/discovery/frontend/report-detail.html?id=${encodeURIComponent(item.found_report_id)}`;
  link.textContent = item.item_name;
  nameCell.appendChild(link);

  const placeCell = document.createElement('td');
  placeCell.textContent = item.storage_place;

  const storedCell = document.createElement('td');
  storedCell.textContent = formatDateOnly(item.stored_at);

  const deadlineCell = document.createElement('td');
  deadlineCell.textContent = formatDateOnly(item.storage_deadline);

  const retentionCell = document.createElement('td');
  const retentionInfo = formatRetentionLabel(item);
  retentionCell.appendChild(createBadge(retentionInfo.label, retentionInfo.badgeClass));

  const statusCell = document.createElement('td');
  const statusInfo = STORAGE_STATUS_MAP[item.status] || {
    label: item.status,
    badgeClass: 'ops-badge-closed',
  };
  statusCell.appendChild(createBadge(statusInfo.label, statusInfo.badgeClass));
  if (item.disposition_note) {
    const note = document.createElement('div');
    note.textContent = `사유: ${item.disposition_note}`;
    note.className = 'ops-message';
    statusCell.appendChild(note);
  }

  const actionCell = document.createElement('td');
  if (item.status === 'STORED') {
    const actions = document.createElement('div');
    actions.className = 'ops-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-secondary';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => openEditPanel(item));

    const disposeBtn = document.createElement('button');
    disposeBtn.type = 'button';
    disposeBtn.className = 'btn ops-btn-danger';
    disposeBtn.textContent = '폐기·이관';
    disposeBtn.addEventListener('click', () => openDisposePanel(item));

    actions.append(editBtn, disposeBtn);
    actionCell.appendChild(actions);
  } else {
    actionCell.textContent = item.disposed_at ? formatDateOnly(item.disposed_at) : '완료';
  }

  row.append(nameCell, placeCell, storedCell, deadlineCell, retentionCell, statusCell, actionCell);
  return row;
}

async function loadCandidates() {
  candidatesById.clear();
  candidateSelect.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '보관 접수할 습득물을 선택하세요';
  candidateSelect.appendChild(placeholder);

  try {
    const data = await api('/api/operations/admin/storage/candidates?page=1&limit=100');
    for (const report of data.items || []) {
      candidatesById.set(String(report.report_id), report);
      const option = document.createElement('option');
      option.value = String(report.report_id);
      option.textContent = `#${report.report_id} ${report.item_name} (${report.place})`;
      candidateSelect.appendChild(option);
    }
    if ((data.items || []).length === 0) {
      placeholder.textContent = '미등록 습득물이 없습니다';
    }
  } catch (error) {
    setMessage(intakeMessage, error.message, 'error');
  }
}

async function loadStorageList(page = 1) {
  const version = ++loadVersion;
  setMessage(storageMessage, '보관 물품 목록을 불러오는 중입니다...');
  tableBody.replaceChildren();
  emptyMessage.hidden = true;
  pagination.hidden = true;

  const params = new URLSearchParams({
    page: String(page),
    limit: '20',
    q: searchInput.value.trim(),
  });
  if (statusFilter.value !== 'all') {
    params.set('status', statusFilter.value);
  }
  if (retentionFilter.value !== 'all') {
    params.set('retention', retentionFilter.value);
  }

  try {
    const data = await api(`/api/operations/admin/storage?${params.toString()}`);
    if (version !== loadVersion) {
      return;
    }
    setMessage(storageMessage, '');

    const summary = data.summary || {};
    totalCount.textContent = String(summary.total ?? 0);
    storedCount.textContent = String(summary.stored ?? 0);
    expiringCount.textContent = String(summary.expiringSoon ?? 0);
    expiredCount.textContent = String(summary.expired ?? 0);
    closedCount.textContent = String(
      (summary.handedOver ?? 0) + (summary.disposed ?? 0) + (summary.transferred ?? 0),
    );

    currentPage = data.page;
    totalPages = Math.max(1, Math.ceil(data.total / data.limit));

    if (data.items.length === 0) {
      emptyMessage.hidden = false;
      return;
    }

    for (const item of data.items) {
      tableBody.appendChild(createStorageRow(item));
    }

    pageInfo.textContent = `${currentPage} / ${totalPages} (총 ${data.total}건)`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    pagination.hidden = false;
  } catch (error) {
    if (version !== loadVersion) {
      return;
    }
    setMessage(storageMessage, error.message, 'error');
    showToast(error.message);
  }
}

async function init() {
  const admin = await requireUser({ admin: true });
  if (!admin) {
    return;
  }
  main.hidden = false;

  candidateSelect.addEventListener('change', () => {
    const selected = candidatesById.get(candidateSelect.value);
    if (selected?.storage_place) {
      intakePlace.value = selected.storage_place;
    }
  });

  intakeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const foundReportId = Number(candidateSelect.value);
    const storagePlace = intakePlace.value.trim();
    const retentionDays = intakeDays.value ? Number(intakeDays.value) : undefined;
    const storageDeadline = intakeDeadline.value || undefined;

    if (!foundReportId || !storagePlace) {
      setMessage(intakeMessage, '습득물과 보관 장소를 입력해주세요.', 'error');
      return;
    }

    intakeSubmit.disabled = true;
    setMessage(intakeMessage, '보관 접수를 등록하는 중입니다...');

    try {
      await api('/api/operations/admin/storage', {
        method: 'POST',
        body: {
          foundReportId,
          storagePlace,
          ...(storageDeadline ? { storageDeadline } : { retentionDays }),
        },
      });
      showToast('보관 기록이 등록되었습니다.');
      setMessage(intakeMessage, '보관 기록이 등록되었습니다.', 'ok');
      intakeForm.reset();
      intakeDays.value = '180';
      await Promise.all([loadCandidates(), loadStorageList(1)]);
    } catch (error) {
      setMessage(intakeMessage, error.message, 'error');
      showToast(error.message);
    } finally {
      intakeSubmit.disabled = false;
    }
  });

  checkRetentionButton.addEventListener('click', async () => {
    checkRetentionButton.disabled = true;
    setMessage(intakeMessage, '보관 기한 임박·초과 물품을 점검하는 중입니다...');
    try {
      const result = await api('/api/operations/admin/storage/check-retention', {
        method: 'POST',
        body: { withinDays: 7 },
      });
      const text = `점검 완료: 기한 임박 ${result.expiringSoonCount}건, 기한 초과 ${result.expiredCount}건, 신규 알림 ${result.notifiedCount}건`;
      showToast(text);
      setMessage(intakeMessage, text, 'ok');
      await loadStorageList(currentPage);
    } catch (error) {
      setMessage(intakeMessage, error.message, 'error');
      showToast(error.message);
    } finally {
      checkRetentionButton.disabled = false;
    }
  });

  editStorageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeStorage) {
      return;
    }
    const storagePlace = editStoragePlace.value.trim();
    const storageDeadline = editStorageDeadline.value;
    if (!storagePlace || !storageDeadline) {
      setMessage(actionPanelMessage, '보관 장소와 보관 기한을 입력해주세요.', 'error');
      return;
    }
    setMessage(actionPanelMessage, '보관 정보를 저장하는 중입니다...');
    try {
      await api(`/api/operations/admin/storage/${activeStorage.storage_id}`, {
        method: 'PATCH',
        body: { storagePlace, storageDeadline },
      });
      showToast('보관 정보가 수정되었습니다.');
      closeActionPanel();
      await loadStorageList(currentPage);
    } catch (error) {
      setMessage(actionPanelMessage, error.message, 'error');
      showToast(error.message);
    }
  });

  disposeStorageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeStorage) {
      return;
    }
    const status = disposeStatus.value;
    const dispositionNote = disposeNote.value.trim();
    if (!dispositionNote) {
      setMessage(actionPanelMessage, '폐기·이관 사유를 입력해주세요.', 'error');
      return;
    }
    const label = status === 'DISPOSED' ? '폐기' : '이관';
    if (!window.confirm(`'${activeStorage.item_name}' 물품을 ${label} 처리하시겠습니까?`)) {
      return;
    }

    setMessage(actionPanelMessage, `${label} 처리를 저장하는 중입니다...`);
    try {
      await api(`/api/operations/admin/storage/${activeStorage.storage_id}/dispose`, {
        method: 'POST',
        body: { status, dispositionNote },
      });
      showToast(`${label} 처리가 완료되었습니다.`);
      closeActionPanel();
      await loadStorageList(currentPage);
    } catch (error) {
      setMessage(actionPanelMessage, error.message, 'error');
      showToast(error.message);
    }
  });

  cancelEditButton.addEventListener('click', closeActionPanel);
  cancelDisposeButton.addEventListener('click', closeActionPanel);

  storageFilterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadStorageList(1);
  });
  statusFilter.addEventListener('change', () => loadStorageList(1));
  retentionFilter.addEventListener('change', () => loadStorageList(1));
  prevButton.addEventListener('click', () => {
    if (currentPage > 1) {
      loadStorageList(currentPage - 1);
    }
  });
  nextButton.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadStorageList(currentPage + 1);
    }
  });

  await Promise.all([loadCandidates(), loadStorageList(1)]);
}

init();

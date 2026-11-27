// [D] 관리자 인계 신청 상세 조회, 보관 정보 저장(storage_records), 정방향 심사·인계 완료를 처리합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  HANDOVER_STATUS_MAP,
  REPORT_STATUS_LABELS,
  STORAGE_STATUS_MAP,
  createBadge,
  extractContactAndProof,
  formatDateTime,
  setMessage,
  toDateInputValue,
  toLocalDateTime,
  toUtcDateTime,
} from './operations-common.js';

const main = document.querySelector('main');
const pageMessage = document.getElementById('page-message');
const detailSections = document.getElementById('detail-sections');

const storageInfoForm = document.getElementById('storage-info-form');
const storageLocationInput = document.getElementById('storage-location-input');
const storageDeadlineInput = document.getElementById('storage-deadline-input');
const saveStorageButton = document.getElementById('save-storage-button');
const reportDetailLink = document.getElementById('report-detail-link');
const storageInfoMessage = document.getElementById('storage-info-message');

const applicationStatus = document.getElementById('application-status');
const reviewInfo = document.getElementById('review-info');
const reviewNoteInput = document.getElementById('review-note-input');
const reviewButton = document.getElementById('review-button');
const approveButton = document.getElementById('approve-button');
const rejectButton = document.getElementById('reject-button');
const resultMessage = document.getElementById('result-message');

const completeForm = document.getElementById('complete-form');
const recipientNameInput = document.getElementById('recipient-name-input');
const completionDateInput = document.getElementById('completion-date-input');
const completeHandoverButton = document.getElementById('complete-handover-button');
const completionMessage = document.getElementById('completion-message');

const params = new URLSearchParams(window.location.search);
const requestIdParam = params.get('id');

let currentHandover = null;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

function renderDetail(item) {
  currentHandover = item;

  setText('item-name', item.found_item_name);
  setText('item-meta', `${item.found_category} · ${item.found_place}`);
  setText('found-date-text', formatDateTime(item.found_occurred_at));
  setText('found-status-text', REPORT_STATUS_LABELS[item.found_status] || item.found_status);
  setText('reported-storage-text', item.found_storage_place || '미입력');
  setText(
    'linked-lost-text',
    item.lost_report_id ? `#${item.lost_report_id} ${item.lost_item_name || ''}` : '연결 없음',
  );
  reportDetailLink.href = `/features/discovery/frontend/report-detail.html?id=${encodeURIComponent(item.found_report_id)}`;

  const hasStorage = Boolean(item.storage_id);
  const canEditStorage =
    (hasStorage && item.storage_status === 'STORED') ||
    (!hasStorage && !['HANDED_OVER', 'DISPOSED', 'TRANSFERRED'].includes(item.found_status));

  storageLocationInput.value = item.record_storage_place || item.found_storage_place || '';
  storageDeadlineInput.value = toDateInputValue(item.storage_deadline);
  storageLocationInput.disabled = !canEditStorage;
  storageDeadlineInput.disabled = !canEditStorage;
  saveStorageButton.disabled = !canEditStorage;
  saveStorageButton.textContent = hasStorage ? '보관 정보 수정' : '보관 기록 접수';

  if (hasStorage && !canEditStorage) {
    const stLabel = STORAGE_STATUS_MAP[item.storage_status]?.label || item.storage_status;
    setMessage(storageInfoMessage, `보관 기록이 종료(${stLabel})되어 수정할 수 없습니다.`);
  } else if (!hasStorage && canEditStorage) {
    setMessage(
      storageInfoMessage,
      '아직 보관 기록(storage_records)이 없습니다. 저장 시 보관 기록으로 접수됩니다.',
    );
  } else {
    setMessage(storageInfoMessage, '');
  }

  const { contact, proof } = extractContactAndProof(item.ownership_proof);
  setText('applicant-name', `${item.requester_name} (${item.requester_login_id})`);
  setText('applicant-email', item.requester_email || '정보 없음');
  setText('applicant-contact', contact || '미입력');
  setText('applied-at', formatDateTime(item.created_at));
  setText('application-reason', proof || '없음');

  const statusInfo = HANDOVER_STATUS_MAP[item.status] || {
    label: item.status,
    badgeClass: 'ops-badge-closed',
  };
  applicationStatus.replaceChildren(createBadge(statusInfo.label, statusInfo.badgeClass));

  reviewInfo.textContent = item.reviewed_at
    ? `${item.reviewer_name || '관리자'} · ${formatDateTime(item.reviewed_at)}`
    : '미검토';
  reviewNoteInput.value = item.review_note || '';

  const isRequested = item.status === 'REQUESTED';
  const isUnderReview = item.status === 'UNDER_REVIEW';
  const isApproved = item.status === 'APPROVED';
  const isCompleted = item.status === 'COMPLETED';
  const canReview = isRequested || isUnderReview;

  reviewNoteInput.disabled = !canReview;
  reviewButton.disabled = !isRequested;
  approveButton.disabled = !canReview;
  rejectButton.disabled = !canReview;

  recipientNameInput.value = item.recipient_name || '';
  completionDateInput.value = toLocalDateTime(item.completed_at);
  recipientNameInput.disabled = !isApproved;
  completionDateInput.disabled = !isApproved;
  completeHandoverButton.disabled = !isApproved;

  if (isCompleted) {
    setMessage(
      completionMessage,
      `인계 완료: ${formatDateTime(item.completed_at)} / 수령자: ${item.recipient_name}`,
      'ok',
    );
  } else if (isApproved) {
    setMessage(
      completionMessage,
      '승인 완료 상태입니다. 실제 수령 후 수령자 이름과 완료 일시를 기록해주세요.',
    );
  } else {
    setMessage(
      completionMessage,
      '인계 승인(APPROVED) 상태에서만 실물 인계 완료를 처리할 수 있습니다.',
    );
  }

  detailSections.hidden = false;
}

async function loadDetail() {
  setMessage(pageMessage, '인계 신청 상세를 불러오는 중입니다...');
  try {
    const data = await api(`/api/operations/admin/handovers/${requestIdParam}`);
    setMessage(pageMessage, '');
    renderDetail(data);
  } catch (error) {
    setMessage(pageMessage, error.message, 'error');
    detailSections.hidden = true;
    showToast(error.message);
  }
}

async function handleReview(nextStatus) {
  if (!currentHandover) {
    return;
  }
  const reviewNote = reviewNoteInput.value.trim();
  reviewButton.disabled = true;
  approveButton.disabled = true;
  rejectButton.disabled = true;
  setMessage(resultMessage, '상태를 변경하는 중입니다...');

  try {
    const updated = await api(`/api/operations/admin/handovers/${currentHandover.request_id}/status`, {
      method: 'PATCH',
      body: {
        status: nextStatus,
        ...(reviewNote ? { reviewNote } : {}),
      },
    });
    const label = HANDOVER_STATUS_MAP[nextStatus]?.label || nextStatus;
    showToast(`신청 상태가 '${label}'(으)로 변경되었습니다.`);
    setMessage(resultMessage, `신청 상태가 '${label}'(으)로 변경되었습니다.`, 'ok');
    renderDetail(updated);
  } catch (error) {
    setMessage(resultMessage, error.message, 'error');
    showToast(error.message);
    renderDetail(currentHandover);
  }
}

async function init() {
  const admin = await requireUser({ admin: true });
  if (!admin) {
    return;
  }

  if (
    !requestIdParam ||
    !/^[1-9]\d*$/.test(requestIdParam) ||
    !Number.isSafeInteger(Number(requestIdParam))
  ) {
    window.location.replace('./admin-handovers.html');
    return;
  }

  main.hidden = false;

  storageInfoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentHandover) {
      return;
    }
    const storagePlace = storageLocationInput.value.trim();
    const storageDeadline = storageDeadlineInput.value || undefined;
    if (!storagePlace) {
      setMessage(storageInfoMessage, '보관 장소를 입력해주세요.', 'error');
      return;
    }

    saveStorageButton.disabled = true;
    setMessage(storageInfoMessage, '보관 정보를 저장하는 중입니다...');

    try {
      if (currentHandover.storage_id) {
        await api(`/api/operations/admin/storage/${currentHandover.storage_id}`, {
          method: 'PATCH',
          body: {
            storagePlace,
            ...(storageDeadline ? { storageDeadline } : {}),
          },
        });
      } else {
        await api('/api/operations/admin/storage', {
          method: 'POST',
          body: {
            foundReportId: currentHandover.found_report_id,
            storagePlace,
            ...(storageDeadline ? { storageDeadline } : {}),
          },
        });
      }
      showToast('보관 정보가 저장되었습니다.');
      setMessage(storageInfoMessage, '보관 정보가 저장되었습니다.', 'ok');
      await loadDetail();
    } catch (error) {
      setMessage(storageInfoMessage, error.message, 'error');
      showToast(error.message);
      saveStorageButton.disabled = false;
    }
  });

  reviewButton.addEventListener('click', () => handleReview('UNDER_REVIEW'));
  approveButton.addEventListener('click', () => handleReview('APPROVED'));
  rejectButton.addEventListener('click', () => {
    if (window.confirm('이 인계 신청을 거절하시겠습니까? 습득물 상태는 신청 이전 상태로 복원됩니다.')) {
      handleReview('REJECTED');
    }
  });

  completeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentHandover) {
      return;
    }
    const recipientName = recipientNameInput.value.trim();
    if (!recipientName) {
      setMessage(completionMessage, '실제 수령자 이름을 입력해주세요.', 'error');
      return;
    }
    const completedAt = toUtcDateTime(completionDateInput.value);

    completeHandoverButton.disabled = true;
    setMessage(completionMessage, '인계 완료를 기록하는 중입니다...');

    try {
      const updated = await api(
        `/api/operations/admin/handovers/${currentHandover.request_id}/complete`,
        {
          method: 'POST',
          body: {
            recipientName,
            ...(completedAt ? { completedAt } : {}),
          },
        },
      );
      showToast('실물 인계 완료 처리가 저장되었습니다.');
      setMessage(resultMessage, '인계 완료 처리가 저장되었습니다.', 'ok');
      renderDetail(updated);
    } catch (error) {
      setMessage(completionMessage, error.message, 'error');
      showToast(error.message);
      completeHandoverButton.disabled = false;
    }
  });

  await loadDetail();
}

init();

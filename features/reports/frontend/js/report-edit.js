// [B] 본인 신고 단건 조회(/api/reports/:id)와 수정·삭제 요청을 처리합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import { formatDateOnly, splitStoragePlace } from './reports-common.js';

const form = document.querySelector('#editForm');
const notice = document.querySelector('#formNotice');
const submitBtn = document.querySelector('#submitBtn');
const deleteBtn = document.querySelector('#deleteBtn');
const storagePlaceField = document.querySelector('#storagePlaceField');

let currentReport = null;

// 폼 전체 입력칸과 버튼의 비활성화 상태를 한 번에 전환합니다.
function setFormDisabled(disabled) {
  for (const element of form.elements) {
    if (element.name === 'type') {
      element.disabled = true;
      continue;
    }
    element.disabled = disabled;
  }
}

// DB에 저장된 카테고리·장소가 기본 옵션에 없더라도 값이 유지되도록 보강합니다.
function setSelectValue(select, value) {
  if (value && !Array.from(select.options).some((option) => option.value === value)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.value = value || '';
}

// URL 쿼리스트링의 신고 ID를 검증합니다. 임의 기본값은 사용하지 않습니다.
function readReportId() {
  const rawId = new URLSearchParams(location.search).get('id');
  if (!rawId || !/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return null;
  }
  return rawId;
}

// 서버에서 기존 신고 정보를 불러와 입력칸에 채웁니다.
async function loadReport(reportId) {
  setFormDisabled(true);
  try {
    const report = await api(`/api/reports/${reportId}`);
    currentReport = report;

    form.type.value = report.report_type;
    form.itemName.value = report.item_name;
    setSelectValue(form.category, report.category);
    setSelectValue(form.place, report.place);
    form.date.value = formatDateOnly(report.occurred_at);

    if (report.report_type === 'FOUND') {
      const { storagePlace, details } = splitStoragePlace(report.description);
      storagePlaceField.hidden = false;
      form.storagePlace.value = storagePlace;
      form.details.value = details;
    } else {
      storagePlaceField.hidden = true;
      form.storagePlace.value = '';
      form.details.value = report.description || '';
    }

    setFormDisabled(false);
  } catch (error) {
    notice.textContent = error.message;
    notice.hidden = false;
    showToast(error.message);
  }
}

// 로그인 확인 후 수정 대상 신고를 불러오고 저장·삭제 이벤트를 연결합니다.
async function init() {
  const user = await requireUser();
  if (!user) {
    return;
  }

  const reportId = readReportId();
  if (!reportId) {
    setFormDisabled(true);
    notice.textContent = '올바른 신고 번호가 필요합니다. 내 신고 내역에서 다시 선택해주세요.';
    notice.hidden = false;
    return;
  }

  await loadReport(reportId);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentReport) {
      return;
    }
    notice.hidden = true;

    if (!form.checkValidity()) {
      showToast('필수 항목을 모두 입력해 주세요.');
      return;
    }

    const payload = {
      itemName: form.itemName.value.trim(),
      category: form.category.value,
      place: form.place.value,
      occurredAt: form.date.value,
      description: form.details.value.trim(),
    };
    if (currentReport.report_type === 'FOUND') {
      payload.storagePlace = form.storagePlace.value.trim();
    }

    submitBtn.disabled = true;
    deleteBtn.disabled = true;
    try {
      await api(`/api/reports/${reportId}`, { method: 'PATCH', body: payload });
      showToast('신고 내역이 수정되었습니다.');
      location.assign('./my-reports.html');
    } catch (error) {
      notice.textContent = error.message;
      notice.hidden = false;
      showToast(error.message);
      submitBtn.disabled = false;
      deleteBtn.disabled = false;
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!currentReport) {
      return;
    }
    if (!window.confirm('이 신고 내역을 정말 삭제하시겠습니까?')) {
      return;
    }

    submitBtn.disabled = true;
    deleteBtn.disabled = true;
    try {
      await api(`/api/reports/${reportId}`, { method: 'DELETE', body: {} });
      showToast('신고 내역이 삭제되었습니다.');
      location.assign('./my-reports.html');
    } catch (error) {
      notice.textContent = error.message;
      notice.hidden = false;
      showToast(error.message);
      submitBtn.disabled = false;
      deleteBtn.disabled = false;
    }
  });
}

init();

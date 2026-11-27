// [D] URL의 foundReportId로 습득물 정보를 조회하고 실제 인계 신청 API를 호출합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import { REPORT_STATUS_LABELS, formatDateTime, setMessage } from './operations-common.js';

const APPLY_ALLOWED_FOUND_STATUSES = ['REPORTED', 'RECEIVED', 'STORED', 'MATCHED'];
const APPLY_ALLOWED_LOST_STATUSES = ['REPORTED', 'RECEIVED', 'MATCHED'];

const main = document.querySelector('main');
const pageMessage = document.getElementById('page-message');
const foundItemBox = document.getElementById('found-item-box');
const handoverForm = document.getElementById('handover-form');
const fallbackActions = document.getElementById('fallback-actions');

const applicantDisplay = document.getElementById('applicant-display');
const lostReportSelect = document.getElementById('lost-report-select');
const contactInput = document.getElementById('contact-input');
const ownershipProofInput = document.getElementById('ownership-proof');
const submitButton = document.getElementById('submit-button');
const resultMessage = document.getElementById('result-message');

const params = new URLSearchParams(window.location.search);
const foundReportIdParam = params.get('foundReportId');

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) {
    node.textContent = value;
  }
}

async function loadMyLostReports() {
  try {
    const data = await api('/api/reports/mine?page=1&limit=100');
    const eligibleLost = (data.items || []).filter(
      (item) =>
        item.report_type === 'LOST' && APPLY_ALLOWED_LOST_STATUSES.includes(item.status),
    );
    for (const report of eligibleLost) {
      const option = document.createElement('option');
      option.value = String(report.report_id);
      option.textContent = `#${report.report_id} ${report.item_name} (${report.place})`;
      lostReportSelect.appendChild(option);
    }
  } catch {
    // 선택 항목이므로 조회 실패 시에도 인계 신청은 계속 진행할 수 있습니다.
  }
}

async function init() {
  const user = await requireUser();
  if (!user) {
    return;
  }
  main.hidden = false;
  applicantDisplay.value = `${user.name} (${user.login_id})`;

  if (
    !foundReportIdParam ||
    !/^[1-9]\d*$/.test(foundReportIdParam) ||
    !Number.isSafeInteger(Number(foundReportIdParam))
  ) {
    setMessage(
      pageMessage,
      '인계 신청할 습득물 정보가 없습니다. 습득물 검색 또는 상세 화면에서 선택해주세요.',
      'error',
    );
    fallbackActions.hidden = false;
    return;
  }

  const foundReportId = Number(foundReportIdParam);
  setMessage(pageMessage, '습득물 정보를 불러오는 중입니다...');

  try {
    const report = await api(`/api/discovery/reports/${foundReportId}`);
    if (report.report_type !== 'FOUND') {
      setMessage(pageMessage, '습득물 신고에 대해서만 인계 신청할 수 있습니다.', 'error');
      fallbackActions.hidden = false;
      return;
    }

    setText('found-item-name', report.item_name);
    setText('found-item-category', report.category);
    setText('found-item-place', report.place);
    setText('found-item-occurred', formatDateTime(report.occurred_at));
    setText('found-item-storage', report.storage_place || '미입력');
    setText('found-item-status', REPORT_STATUS_LABELS[report.status] || report.status);
    foundItemBox.hidden = false;

    if (!APPLY_ALLOWED_FOUND_STATUSES.includes(report.status)) {
      setMessage(
        pageMessage,
        `현재 상태(${REPORT_STATUS_LABELS[report.status] || report.status})의 습득물은 인계 신청할 수 없습니다.`,
        'error',
      );
      fallbackActions.hidden = false;
      return;
    }

    setMessage(pageMessage, '');
    await loadMyLostReports();
    handoverForm.hidden = false;

    handoverForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const ownershipProof = ownershipProofInput.value.trim();
      const contact = contactInput.value.trim();
      const lostReportId = lostReportSelect.value ? Number(lostReportSelect.value) : null;

      if (!ownershipProof) {
        setMessage(resultMessage, '소유 증명 내용을 입력해주세요.', 'error');
        return;
      }

      submitButton.disabled = true;
      setMessage(resultMessage, '인계 신청을 접수하는 중입니다...');

      try {
        await api('/api/operations/handovers', {
          method: 'POST',
          body: {
            foundReportId,
            ...(lostReportId ? { lostReportId } : {}),
            ...(contact ? { contact } : {}),
            ownershipProof,
          },
        });
        showToast('인계 신청이 접수되었습니다.');
        setMessage(
          resultMessage,
          '인계 신청이 접수되었습니다. 내 인계 현황에서 심사 결과를 확인할 수 있습니다.',
          'ok',
        );
        handoverForm.reset();
        applicantDisplay.value = `${user.name} (${user.login_id})`;
        fallbackActions.hidden = false;
      } catch (error) {
        setMessage(resultMessage, error.message, 'error');
        showToast(error.message);
        submitButton.disabled = false;
      }
    });
  } catch (error) {
    setMessage(pageMessage, error.message, 'error');
    fallbackActions.hidden = false;
  }
}

init();

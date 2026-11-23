// [B] 분실물 정보·사진 입력과 신고 등록 API(/api/reports) 호출을 처리합니다.

import { api } from '../../../../shared/frontend/js/api.js';
import { requireUser } from '../../../../shared/frontend/js/auth-guard.js';
import { showToast } from '../../../../shared/frontend/js/toast.js';
import {
  assertSafePayloadSize,
  formatSelectedPhotoNames,
  preparePhotoPayloads,
} from './reports-common.js';

const form = document.querySelector('#reportForm');
const photoInput = document.querySelector('#itemPhoto');
const fileName = document.querySelector('#fileName');
const notice = document.querySelector('#formNotice');
const submitBtn = document.querySelector('#submitBtn');

// 로그인 상태와 신고 제한 여부를 확인한 뒤 입력 이벤트를 연결합니다.
async function init() {
  const user = await requireUser();
  if (!user) {
    return;
  }

  if (user.report_blocked) {
    notice.textContent = '현재 신고 등록이 제한된 계정입니다. 기존 신고 조회는 계속 이용할 수 있습니다.';
    notice.hidden = false;
    submitBtn.disabled = true;
  }

  photoInput.addEventListener('change', () => {
    fileName.textContent = formatSelectedPhotoNames(photoInput.files);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.hidden = true;

    if (user.report_blocked) {
      showToast('신고 등록이 제한된 계정입니다.');
      return;
    }

    if (!form.checkValidity()) {
      showToast('필수 항목을 모두 입력해 주세요.');
      return;
    }

    submitBtn.disabled = true;
    try {
      const photos = await preparePhotoPayloads(photoInput.files);
      const payload = {
        reportType: 'LOST',
        itemName: form.itemName.value.trim(),
        category: form.category.value,
        place: form.place.value,
        occurredAt: form.date.value,
        description: form.details.value.trim(),
        photos,
      };
      assertSafePayloadSize(payload);

      await api('/api/reports', { method: 'POST', body: payload });
      showToast('분실물 신고가 등록되었습니다.');
      location.assign('./my-reports.html');
    } catch (error) {
      notice.textContent = error.message;
      notice.hidden = false;
      showToast(error.message);
      submitBtn.disabled = false;
    }
  });
}

init();

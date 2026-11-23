// [B] 습득물 정보·보관 장소·사진 입력과 신고 요청을 처리합니다.

import { showToast } from '../../../../shared/frontend/js/toast.js';
// 추후 백엔드 API 연동 시 아래 모듈을 사용합니다.
// import { api } from '../../../../shared/frontend/js/api.js';

const form = document.querySelector('#foundForm');
const photoInput = document.querySelector('#itemPhoto');
const fileName = document.querySelector('#fileName');

// 파일 선택 시 파일명을 화면에 표시합니다.
photoInput.addEventListener('change', () => {
  fileName.textContent = photoInput.files[0]?.name || 'JPG, PNG · 최대 10MB';
});

// 폼 제출 시 유효성을 검사하고 입력 데이터를 처리합니다.
form.addEventListener('submit', async (event) => {
  // 브라우저의 기본 새로고침 동작을 방지합니다.
  event.preventDefault();

  // 필수 입력 항목이 비어 있는지 확인합니다.
  if (!form.checkValidity()) {
    showToast('필수 항목을 모두 입력해 주세요.');
    return;
  }

  // 입력된 폼 데이터를 객체로 구성합니다.
  const reportData = {
    itemName: form.itemName.value.trim(),
    category: form.category.value,
    place: form.place.value,
    date: form.date.value,
    storagePlace: form.storagePlace.value.trim(),
    details: form.details.value.trim(),
  };

  console.log('전송할 습득물 데이터:', reportData);

  // 추후 서버 연동 시 API 요청을 전송합니다.
  // await api('/api/reports/found', { method: 'POST', body: reportData });

  // 등록 완료 안내를 표시하고 폼을 초기화합니다.
  showToast('습득물이 성공적으로 등록되었습니다!');
  form.reset();
  fileName.textContent = 'JPG, PNG · 최대 10MB';
});
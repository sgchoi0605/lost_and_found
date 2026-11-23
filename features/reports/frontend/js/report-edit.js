// [B] 본인 신고 내용 조회와 수정·삭제 요청을 처리합니다.

import { showToast } from '../../../../shared/frontend/js/toast.js';
// 추후 백엔드 API 연동 시 아래 모듈을 사용합니다.
// import { api } from '../../../../shared/frontend/js/api.js';

const form = document.querySelector('#editForm');
const deleteBtn = document.querySelector('#deleteBtn');

// URL 쿼리스트링에서 수정 대상 신고 번호를 추출합니다.
const params = new URLSearchParams(location.search);
const reportId = Number(params.get('id')) || 1;

// 서버 연동 전 화면 확인용 임시 신고 데이터입니다.
const SAMPLE_REPORTS = [
  {
    id: 1,
    type: '분실물',
    itemName: '브라운 카드 지갑',
    category: '지갑',
    place: '상도동',
    date: '2026-11-15',
    details: '모서리에 약간의 스크래치가 있습니다.',
  },
  {
    id: 2,
    type: '습득물',
    itemName: '검정색 에어팟 프로',
    category: '전자기기',
    place: '사당동',
    date: '2026-11-18',
    details: '투명 케이스가 씌워져 있습니다.',
  },
  {
    id: 3,
    type: '분실물',
    itemName: '검정색 우산',
    category: '기타',
    place: '노량진동',
    date: '2026-11-10',
    details: '손잡이가 나무 재질입니다.',
  },
];

// 대상 신고 데이터를 불러와 폼 입력칸에 채웁니다.
function loadReport() {
  // 추후 서버 연동 시 단건 조회 API로 데이터를 가져옵니다.
  // const report = await api(`/api/reports/${reportId}`);
  const report = SAMPLE_REPORTS.find((item) => item.id === reportId) || SAMPLE_REPORTS[0];

  form.type.value = report.type;
  form.itemName.value = report.itemName;
  form.category.value = report.category;
  form.place.value = report.place;
  form.date.value = report.date;
  form.details.value = report.details;
}

// 폼 제출 시 유효성을 검사하고 수정 요청을 처리합니다.
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    showToast('필수 항목을 모두 입력해 주세요.');
    return;
  }

  const updatedData = {
    type: form.type.value,
    itemName: form.itemName.value.trim(),
    category: form.category.value,
    place: form.place.value,
    date: form.date.value,
    details: form.details.value.trim(),
  };

  console.log(`수정할 신고(${reportId}) 데이터:`, updatedData);

  // 추후 서버 연동 시 수정 API를 호출합니다.
  // await api(`/api/reports/${reportId}`, { method: 'PATCH', body: updatedData });

  showToast('신고 내역이 수정되었습니다.');
  setTimeout(() => location.assign('./my-reports.html'), 800);
});

// 삭제 버튼 클릭 시 확인 후 삭제 요청을 처리합니다.
deleteBtn.addEventListener('click', async () => {
  if (!window.confirm('이 신고 내역을 정말 삭제하시겠습니까?')) return;

  // 추후 서버 연동 시 삭제 API를 호출합니다.
  // await api(`/api/reports/${reportId}`, { method: 'DELETE' });

  showToast('신고 내역이 삭제되었습니다.');
  setTimeout(() => location.assign('./my-reports.html'), 800);
});

// 초기 화면 진입 시 기존 신고 정보를 불러옵니다.
loadReport();
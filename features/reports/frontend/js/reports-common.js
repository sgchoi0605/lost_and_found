// [B] 신고 화면 5종에서 공통으로 쓰는 상태 표시·날짜·보관 장소·사진 압축 도구입니다.

export const REPORT_TYPE_LABELS = {
  LOST: '분실물',
  FOUND: '습득물',
};

// DB 계약 상태값 8종과 화면 표시 라벨·배지 클래스를 매핑합니다.
export const REPORT_STATUS_LIST = [
  { value: 'REPORTED', label: '신고됨', className: 'status-received' },
  { value: 'RECEIVED', label: '접수됨', className: 'status-received' },
  { value: 'STORED', label: '보관 중', className: 'status-received' },
  { value: 'MATCHED', label: '매칭됨', className: 'status-matching' },
  { value: 'HANDOVER_IN_PROGRESS', label: '인계 진행 중', className: 'status-matching' },
  { value: 'HANDED_OVER', label: '인계 완료', className: 'status-ready' },
  { value: 'DISPOSED', label: '폐기', className: 'status-ready' },
  { value: 'TRANSFERRED', label: '이관', className: 'status-ready' },
];

export const REPORT_STATUS_MAP = Object.fromEntries(
  REPORT_STATUS_LIST.map((item) => [item.value, item]),
);

const MAX_PHOTOS = 3;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png'];
const MAX_TOTAL_BINARY_BYTES = 58 * 1024;
const MAX_REQUEST_JSON_BYTES = 95 * 1024;
const STORAGE_PREFIX_PATTERN = /^\[보관 장소:\s*([^\]]*)\]\s*(?:\r?\n)?/;

// UTC ISO 날짜 문자열에서 input[type="date"] 및 목록 표시용 YYYY-MM-DD를 꺼냅니다.
export function formatDateOnly(isoString) {
  if (typeof isoString !== 'string' || !isoString) {
    return '';
  }
  const matched = isoString.match(/^\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : '';
}

// 습득물 description 맨 앞의 [보관 장소: ...] 문구를 분리해 수정 시 중복을 막습니다.
export function splitStoragePlace(description = '') {
  const text = String(description || '');
  const match = text.match(STORAGE_PREFIX_PATTERN);
  if (!match) {
    return { storagePlace: '', details: text };
  }
  return {
    storagePlace: match[1].trim(),
    details: text.slice(match[0].length),
  };
}

// 파일 선택 영역의 안내 문구를 선택된 파일 목록에 맞게 갱신합니다.
export function formatSelectedPhotoNames(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return 'JPG, PNG · 최대 3장 (전송 시 자동 압축)';
  }
  if (files.length > MAX_PHOTOS) {
    return `최대 ${MAX_PHOTOS}장까지 선택할 수 있습니다. (현재 ${files.length}장 선택됨)`;
  }
  return files.map((file) => file.name).join(', ');
}

// Base64 Data URL의 실제 바이너리 바이트 수를 계산합니다.
function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// 브라우저에서 이미지 파일을 읽어 Image 객체로 로드합니다.
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    };
    image.src = objectUrl;
  });
}

// 단일 이미지를 목표 바이너리 용량 이하가 될 때까지 캔버스로 축소·압축합니다.
async function compressImageToDataUrl(file, maxBytes) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('브라우저에서 이미지를 처리할 수 없습니다.');
  }

  const maxSides = [800, 640, 480, 360, 280];
  const qualities = [0.75, 0.6, 0.45, 0.3, 0.2];

  for (const maxSide of maxSides) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height, 1));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (estimateDataUrlBytes(dataUrl) <= maxBytes) {
        return dataUrl;
      }
    }
  }

  throw new Error('사진 용량이 너무 커서 전송할 수 없습니다. 더 작은 사진을 선택해주세요.');
}

// 선택된 사진(최대 3장)을 검사하고 공통 서버 100KB 제한에 맞게 경량 Data URL 배열로 변환합니다.
export async function preparePhotoPayloads(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    return [];
  }
  if (files.length > MAX_PHOTOS) {
    throw new Error(`사진은 최대 ${MAX_PHOTOS}장까지 등록할 수 있습니다.`);
  }

  for (const file of files) {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      throw new Error('JPG 또는 PNG 형식의 사진만 업로드할 수 있습니다.');
    }
  }

  const perPhotoBudget = Math.floor(MAX_TOTAL_BINARY_BYTES / files.length);
  const photos = [];
  for (const file of files) {
    photos.push(await compressImageToDataUrl(file, perPhotoBudget));
  }
  return photos;
}

// 최종 JSON 요청 크기가 공통 서버 100KB 제한을 넘지 않는지 전송 전에 한 번 더 확인합니다.
export function assertSafePayloadSize(payload) {
  const size = new Blob([JSON.stringify(payload)]).size;
  if (size > MAX_REQUEST_JSON_BYTES) {
    throw new Error('요청 크기가 허용 한도를 초과했습니다. 사진 수를 줄이거나 내용을 간략히 적어주세요.');
  }
}

// 목록 화면에 빈 상태나 오류 안내 문구를 안전하게 표시합니다.
export function renderEmptyMessage(container, message) {
  const box = document.createElement('div');
  box.className = 'empty-state';
  box.textContent = message;
  container.replaceChildren(box);
}

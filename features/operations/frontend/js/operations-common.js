// [D] 인계·보관 화면에서 공통으로 사용하는 상태 매핑·날짜 변환·안전 DOM 헬퍼입니다.

export const HANDOVER_STATUS_MAP = {
  REQUESTED: { label: '신청 접수', badgeClass: 'ops-badge-requested' },
  UNDER_REVIEW: { label: '검토 중', badgeClass: 'ops-badge-review' },
  APPROVED: { label: '승인됨', badgeClass: 'ops-badge-approved' },
  REJECTED: { label: '거절됨', badgeClass: 'ops-badge-rejected' },
  COMPLETED: { label: '인계 완료', badgeClass: 'ops-badge-completed' },
};

export const STORAGE_STATUS_MAP = {
  STORED: { label: '보관 중', badgeClass: 'ops-badge-stored' },
  HANDED_OVER: { label: '인계 완료', badgeClass: 'ops-badge-completed' },
  DISPOSED: { label: '폐기', badgeClass: 'ops-badge-closed' },
  TRANSFERRED: { label: '이관', badgeClass: 'ops-badge-closed' },
};

export const RETENTION_STATE_MAP = {
  NORMAL: { label: '정상', badgeClass: 'ops-badge-stored' },
  EXPIRING_SOON: { label: '기한 임박', badgeClass: 'ops-badge-warning' },
  EXPIRED: { label: '기한 초과', badgeClass: 'ops-badge-danger' },
  CLOSED: { label: '종료', badgeClass: 'ops-badge-closed' },
};

export const REPORT_STATUS_LABELS = {
  REPORTED: '신고됨',
  RECEIVED: '접수됨',
  STORED: '보관 중',
  MATCHED: '매칭됨',
  HANDOVER_IN_PROGRESS: '인계 진행 중',
  HANDED_OVER: '인계 완료',
  DISPOSED: '폐기',
  TRANSFERRED: '이관',
};

export function formatDateTime(value) {
  if (!value) {
    return '정보 없음';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '정보 없음' : date.toLocaleString('ko-KR');
}

export function formatDateOnly(value) {
  if (!value) {
    return '정보 없음';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '정보 없음' : date.toLocaleDateString('ko-KR');
}

// UTC ISO 문자열을 <input type="date"> 값(YYYY-MM-DD)으로 변환합니다.
export function toDateInputValue(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// UTC ISO 문자열을 <input type="datetime-local"> 현지 값으로 변환합니다.
export function toLocalDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// <input type="datetime-local"> 현지 값을 UTC ISO 문자열로 변환합니다.
export function toUtcDateTime(localValue) {
  if (!localValue) {
    return undefined;
  }
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// ownership_proof 선두에 포함된 [연락처: ...] 정보를 분리해 표시합니다.
export function extractContactAndProof(raw) {
  const text = String(raw || '');
  const match = text.match(/^\[연락처:\s*([^\]]*)\]\s*\n?/);
  if (!match) {
    return { contact: '', proof: text };
  }
  return {
    contact: match[1].trim(),
    proof: text.slice(match[0].length),
  };
}

export function createBadge(label, badgeClass) {
  const span = document.createElement('span');
  span.className = `ops-badge ${badgeClass}`;
  span.textContent = label;
  return span;
}

export function setMessage(element, text, kind = '') {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.className = kind ? `ops-message ops-message-${kind}` : 'ops-message';
}

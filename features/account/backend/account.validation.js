// [A] 입력 형식이 잘못되면 공통 오류를 발생시켜 저장 전에 요청을 중단합니다.

import { HttpError } from '../../../shared/backend/error.middleware.js';
export function invalid(message) {
  throw new HttpError(400, 'VALIDATION_ERROR', message);
}

// 문자열의 앞뒤 공백을 제거하고 허용 길이인지 확인합니다.
export function text(value, label, min = 1, max = 100) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    invalid(`${label}: ${min}~${max}자로 입력해주세요.`);
  }
  return value.trim();
}

// 아이디는 영문·숫자·밑줄·하이픈 4~30자만 허용합니다.
export function loginId(value) {
  const id = text(value, '아이디', 4, 30);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    invalid('아이디는 영문·숫자·밑줄·하이픈만 사용할 수 있습니다.');
  }
  return id;
}

// 이메일은 소문자로 통일한 뒤 기본 주소 형식을 검사합니다.
export function email(value) {
  const result = text(value, '이메일', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    invalid('이메일 형식을 확인해주세요.');
  }
  return result;
}

// URL로 받은 ID를 안전한 양의 정수로 변환합니다.
export function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    invalid('유효한 ID가 필요합니다.');
  }
  return Number(value);
}

// 페이지 번호와 개수를 검사합니다. offset은 앞에서 건너뛸 행 수입니다.
export function pagination(query) {
  const page = query.page === undefined ? 1 : positiveId(query.page);
  const limit = query.limit === undefined ? 20 : positiveId(query.limit);
  if (limit > 100 || page > 100000) {
    invalid('페이지 또는 조회 개수가 너무 큽니다.');
  }
  return { page, limit, offset: (page - 1) * limit };
}

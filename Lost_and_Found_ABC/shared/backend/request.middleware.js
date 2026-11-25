// [A] DB 값을 바꾸는 API 요청의 출처와 JSON 형식을 검사합니다.

import { HttpError } from './error.middleware.js';

// 쿠키 인증 API의 상태 변경은 같은 출처 + JSON 요청만 허용합니다.
export function protectMutation(req, _res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return next();
  }
  // 요청한 페이지의 주소와 현재 서비스 주소를 비교해 외부 사이트 요청을 막습니다.
  const origin = req.get('origin');
  const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
  if ((origin && origin !== expected) || req.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'INVALID_ORIGIN', '같은 서비스 화면에서 요청해주세요.');
  }
  // 등록·변경·삭제 요청에는 JSON 객체가 필요합니다. 빈 요청도 {}를 보냅니다.
  if (!req.is('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'application/json 요청이 필요합니다.');
  }
  if (
    req.body !== undefined &&
    (req.body === null || Array.isArray(req.body) || typeof req.body !== 'object')
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'JSON 객체를 보내주세요.');
  }
  next();
}

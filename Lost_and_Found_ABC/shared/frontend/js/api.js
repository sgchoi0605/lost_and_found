// [A] 모든 화면에서 같은 방식으로 API를 호출하고 성공 결과 또는 오류를 받게 합니다.

// 화면에서 오류 원인을 구분할 수 있도록 상태·코드·메시지를 보관합니다.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 요청 중에는 await로 기다리고 성공하면 응답의 data만 반환합니다.
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    // 로그인 쿠키를 함께 보내고, body가 있으면 JSON 문자열로 전송합니다.
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  }
  // 서버 응답을 객체로 읽습니다. 실패 응답은 throw하여 호출한 화면에서 처리하게 합니다.
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      json?.error?.code || 'REQUEST_FAILED',
      json?.error?.message || '요청을 처리할 수 없습니다.',
    );
  }
  if (!json || !Object.hasOwn(json, 'data')) {
    throw new ApiError(
      502,
      'INVALID_RESPONSE',
      'API 응답을 확인할 수 없습니다. Express 서버 실행을 확인해주세요.',
    );
  }
  return json.data;
}

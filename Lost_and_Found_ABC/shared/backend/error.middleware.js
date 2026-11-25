// [A] 발생한 오류를 공통 JSON 형식으로 응답합니다. 내부 오류 정보는 숨깁니다.

// 예상 가능한 오류에 HTTP 상태·오류 코드·사용자용 메시지를 함께 담습니다.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 예상하지 못한 서버 오류는 상세 내용 대신 공통 안내만 응답합니다.
export function errorMiddleware(error, _req, res, _next) {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    error: {
      code:
        error instanceof HttpError
          ? error.code
          : status === 500
            ? 'INTERNAL_SERVER_ERROR'
            : 'BAD_REQUEST',
      message:
        error instanceof HttpError
          ? error.message
          : status === 500
            ? '서버 오류가 발생했습니다.'
            : '요청 형식을 확인해주세요.',
    },
  });
}

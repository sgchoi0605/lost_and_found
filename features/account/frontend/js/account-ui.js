// [A] 계정 화면이 함께 쓰는 폼 처리·메시지·요소 생성 함수를 모아 둡니다.

import '../../../../shared/frontend/js/layout.js';

// 화면 파일은 공통 도구를 여기서 한 번에 가져올 수 있습니다.
export { api } from '../../../../shared/frontend/js/api.js';
export { requireUser, safeNext } from '../../../../shared/frontend/js/auth-guard.js';

// 오류·성공 메시지를 표시하고 빈 문자열이면 안내 영역을 숨깁니다.
export function message(text, isError = true) {
  const node = document.querySelector('#message');
  node.textContent = text;
  node.className = isError ? 'account-message error' : 'account-message success';
  node.hidden = !text;
}

// 기본 새로고침을 막고 입력값을 객체로 모아 action에 전달합니다.
export function bindForm(id, action) {
  const form = document.querySelector(id);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message('');
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await action(Object.fromEntries(new FormData(form)), form);
    } catch (error) {
      message(error.message);
    } finally {
      // 성공·실패와 관계없이 제출 버튼을 다시 활성화합니다.
      button.disabled = false;
    }
  });
}

// textContent로 글자를 넣어 사용자 입력이 HTML 코드로 실행되지 않게 합니다.
export function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content != null) {
    node.textContent = content;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

// DB의 날짜 문자열을 한국어 화면용 시각으로 바꿉니다.
export function date(value) {
  return value ? new Date(value).toLocaleString('ko-KR') : '기한 없음';
}

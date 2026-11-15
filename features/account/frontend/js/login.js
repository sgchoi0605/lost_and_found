// [A] 로그인 폼을 전송하고 성공하면 원래 가려던 화면 또는 메인으로 이동합니다.

import { api, bindForm, safeNext, message } from './account-ui.js';

// 가입 완료 표시가 있는 주소로 왔다면 로그인 안내를 보여줍니다.
if (new URLSearchParams(location.search).has('joined')) {
  message('가입이 완료되었습니다. 로그인해주세요.', false);
}

// body는 폼의 name을 키로 모은 객체입니다. 쿠키 저장은 브라우저가 처리합니다.
bindForm('#loginForm', async (body) => {
  await api('/api/account/login', { method: 'POST', body });
  location.assign(safeNext(new URLSearchParams(location.search).get('next')));
});

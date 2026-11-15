// [A] 비밀번호 확인 후 가입 정보를 전송하고 로그인 화면으로 이동합니다.

import { api, bindForm } from './account-ui.js';

// 화면에서 확인을 먼저 검사하고, 서버에서도 같은 조건을 다시 검증합니다.
bindForm('#signupForm', async (body) => {
  if (body.password !== body.confirmPassword) {
    throw new Error('비밀번호 확인이 일치하지 않습니다.');
  }
  await api('/api/account/signup', { method: 'POST', body });
  location.assign('./login.html?joined=1');
});

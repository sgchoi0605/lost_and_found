// [A] 화면을 보여주기 전에 로그인·권한을 확인합니다. 실제 접근 차단은 서버에서도 검사합니다.

import { api } from './api.js';

// 로그인 사용자 정보를 받아오고 관리자 화면이면 role도 확인합니다.
export async function requireUser({ admin = false } = {}) {
  try {
    const user = await api('/api/account/me');
    if (admin && user.role !== 'ADMIN') {
      document.querySelector('main').textContent = '관리자만 이용할 수 있는 화면입니다.';
      document.querySelector('main').hidden = false;
      return null;
    }
    return user;
  } catch (error) {
    // 비로그인 상태면 현재 주소를 next에 담아 로그인 후 돌아오게 합니다.
    if (error.status === 401) {
      location.replace(
        `/features/account/frontend/login.html?next=${encodeURIComponent(location.pathname + location.search)}`,
      );
    } else {
      document.querySelector('main').textContent = error.message;
      document.querySelector('main').hidden = false;
    }
    return null;
  }
}

// 로그인 후 이동할 주소는 같은 서비스 내부 경로만 허용합니다.
export function safeNext(value) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020]/.test(value)
  ) {
    return '/features/discovery/frontend/index.html';
  }
  const url = new URL(value, location.origin);
  return url.origin === location.origin
    ? url.pathname + url.search
    : '/features/discovery/frontend/index.html';
}

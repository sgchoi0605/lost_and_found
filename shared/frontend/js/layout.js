// [A] 로그인 상태에 맞춰 계정 메뉴·로그아웃·메인 알림 버튼을 연결합니다.

import { api } from './api.js';
import { showToast } from './toast.js';
const account = '/features/account/frontend/';

// 링크 요소를 만들고 글자와 이동 주소를 지정합니다.
function link(label, href) {
  const node = document.createElement('a');
  node.textContent = label;
  node.href = href;
  return node;
}

// 로그인 여부를 확인해 방문자·일반 회원·관리자 메뉴를 각각 만듭니다.
export async function mountLayout() {
  let user = null;
  let failure = null;
  try {
    user = await api('/api/account/me');
  } catch (error) {
    if (error.status !== 401) {
      failure = error;
    }
  }
  // data-account-layout이 있는 계정 화면에 공통 헤더를 채웁니다.
  const header = document.querySelector('[data-account-layout]');
  if (header) {
    header.replaceChildren(link('⌖ LOST & FOUND', '/features/discovery/frontend/index.html'));
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', '계정 메뉴');
    nav.append(link('홈', '/features/discovery/frontend/index.html'));
    if (user) {
      const name = document.createElement('span');
      name.textContent = `${user.name}님`;
      nav.append(name, link('알림', account + 'notifications.html'));
    } else {
      nav.append(link('로그인', account + 'login.html'), link('회원가입', account + 'signup.html'));
    }
    header.append(nav);
  }
  // 메인에 남아 있는 A 소유 컨트롤을 공통 모듈에서 실제 계정 화면과 연결합니다.
  const oldLogin = document.querySelector('#loginLink');
  if (oldLogin && user) {
    oldLogin.textContent = `${user.name} · 알림`;
    oldLogin.href = account + 'notifications.html';
  }
  const nav = header?.querySelector('nav') || oldLogin?.parentElement;
  if (nav && user) {
    if (user.role === 'ADMIN') {
      nav.append(link('사용자 관리', account + 'admin-users.html'));
    }
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = '로그아웃';
    logout.className = 'btn btn-secondary';
    // 중복 클릭을 막고 서버 세션을 삭제한 뒤 로그인 화면으로 이동합니다.
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        await api('/api/account/logout', { method: 'POST', body: {} });
        location.assign(account + 'login.html');
      } catch (error) {
        showToast(error.message);
        logout.disabled = false;
      }
    });
    nav.append(logout);
  }
  // 이전 메인의 예시 알림은 숨기고 실제 미읽음 개수로 알림 점을 표시합니다.
  const drawer = document.querySelector('#notificationDrawer');
  if (drawer) {
    drawer.hidden = true;
    drawer.replaceChildren();
  }
  const dot = document.querySelector('.notification-dot');
  if (dot) {
    dot.hidden = true;
    if (user) {
      try {
        dot.hidden = (await api('/api/account/notifications?limit=1')).unreadCount === 0;
      } catch {
        /* 알림 페이지에서 재시도 */
      }
    }
  }
  if (failure && header) {
    showToast(failure.message);
  }
}

// 기존 C의 서랍 열기 핸들러보다 먼저 처리하여 예시 알림을 노출하지 않습니다.
document.querySelector('#notificationButton')?.addEventListener(
  'click',
  (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(account + 'notifications.html');
  },
  true,
);

// 공통 헤더 또는 기존 메인 로그인 링크가 있는 화면에서만 메뉴를 초기화합니다.
if (document.querySelector('[data-account-layout], #loginLink')) {
  mountLayout();
}

// [A] 내 알림을 카드로 표시하고 읽음 처리와 페이지 이동을 연결합니다.

import { api, requireUser, message, element, date } from './account-ui.js';
const list = document.querySelector('#notifications');
let page = 1;

// 현재 페이지 데이터를 받아 이전 목록을 지우고 새 알림 카드를 만듭니다.
async function load() {
  const data = await api(`/api/account/notifications?page=${page}`);
  list.replaceChildren();
  document.querySelector('#unreadCount').textContent = `읽지 않은 알림 ${data.unreadCount}개`;
  document.querySelector('#readAll').disabled = data.unreadCount === 0;
  if (!data.items.length) {
    list.append(element('p', '아직 받은 알림이 없습니다.', 'empty-state'));
  }
  // 알림 종류·내용·시각을 표시하고 미읽음 알림에만 읽음 버튼을 붙입니다.
  for (const item of data.items) {
    const card = element('li', null, `account-notification ${item.read_at ? '' : 'unread'}`);
    const types = { MATCH: '유사 물품', HANDOVER: '인계 변경', EXPIRY: '보관 기한' };
    card.append(
      element('strong', types[item.type]),
      element('p', item.message),
      element('small', date(item.created_at)),
    );
    const actions = element('div', null, 'account-actions');
    if (!item.read_at) {
      const button = element('button', '읽음 처리', 'btn btn-secondary');
      button.type = 'button';
      // 해당 알림만 읽음 처리한 뒤 목록과 미읽음 개수를 다시 불러옵니다.
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await api(`/api/account/notifications/${item.notification_id}/read`, {
            method: 'PATCH',
            body: {},
          });
          await load();
        } catch (error) {
          message(error.message);
          button.disabled = false;
        }
      });
      actions.append(button);
    } else {
      actions.append(element('span', '읽음'));
    }
    if (item.target_path) {
      const a = element('a', '관련 화면', 'btn btn-secondary');
      a.href = item.target_path;
      actions.append(a);
    }
    card.append(actions);
    list.append(card);
  }
  // 전체 개수로 마지막 페이지를 계산하고 이동할 수 없는 버튼은 비활성화합니다.
  document.querySelector('#page').textContent =
    `${page} / ${Math.max(1, Math.ceil(data.total / data.limit))}`;
  // 클릭한 방향에 따라 페이지 번호를 바꾸고 목록을 갱신합니다.
  document.querySelector('#prev').disabled = page <= 1;
  document.querySelector('#next').disabled = page * data.limit >= data.total;
}

// 새로고침·페이지 이동에서 공통으로 사용할 오류 처리를 묶습니다.
async function refresh() {
  message('');
  try {
    await load();
  } catch (error) {
    message(error.message);
  }
}
document.querySelector('#prev').addEventListener('click', () => {
  page--;
  refresh();
});
document.querySelector('#next').addEventListener('click', () => {
  page++;
  refresh();
});
document.querySelector('#retry').addEventListener('click', refresh);

// 전체 읽음 요청은 서버에서 본인 미읽음 알림에만 적용됩니다.
document.querySelector('#readAll').addEventListener('click', async (event) => {
  event.target.disabled = true;
  try {
    await api('/api/account/notifications/read-all', { method: 'PATCH', body: {} });
    await load();
  } catch (error) {
    message(error.message);
    event.target.disabled = false;
  }
});

// 로그인 확인을 통과한 뒤 숨겨 둔 본문을 표시하고 목록을 불러옵니다.
if (await requireUser()) {
  document.querySelector('main').hidden = false;
  await refresh();
}

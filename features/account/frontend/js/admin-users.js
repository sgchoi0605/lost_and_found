// [A] 관리자용 사용자 목록과 각 사용자의 신고 제한·해제 폼을 만듭니다.

import { api, requireUser, message, element, date, bindForm } from './account-ui.js';
let page = 1;
let q = '';

// 검색어와 페이지를 API로 보내고 사용자 카드를 다시 그립니다.
async function load() {
  const data = await api(`/api/account/admin/users?page=${page}&q=${encodeURIComponent(q)}`);
  const list = document.querySelector('#users');
  list.replaceChildren();
  if (!data.items.length) {
    list.append(element('p', '검색 결과가 없습니다.', 'empty-state'));
  }
  // 각 카드에 계정 정보와 현재 유효한 신고 제한 상태를 표시합니다.
  for (const user of data.items) {
    const card = element('li', null, 'user-card');
    card.append(
      element('h2', user.name),
      element('p', `${user.login_id} · ${user.email}`),
      element(
        'p',
        `${user.role === 'ADMIN' ? '관리자' : '일반 회원'} · 가입 ${date(user.created_at)}`,
      ),
    );
    const state = user.report_blocked ? `신고 제한 중 · ${date(user.blocked_until)}` : '신고 가능';
    card.append(element('strong', state));
    // 일반 회원에게만 제한 폼을 만듭니다. 서버도 관리자 제한을 거부합니다.
    if (user.role !== 'ADMIN') {
      const form = element('form');
      form.className = 'restriction-form';
      const reason = element('input');
      reason.name = 'reason';
      reason.required = true;
      reason.maxLength = 500;
      reason.placeholder = '변경 사유 (필수)';
      reason.setAttribute('aria-label', `${user.login_id} 변경 사유`);
      const until = element('input');
      until.type = 'datetime-local';
      until.name = 'until';
      until.setAttribute('aria-label', `${user.login_id} 제한 종료일`);
      const label = element('label', '제한 종료일 (비우면 기한 없음)');
      label.append(until);
      if (user.report_blocked) {
        label.hidden = true;
      }
      const submit = element(
        'button',
        user.report_blocked ? '제한 해제' : '신고 제한',
        'btn btn-primary',
      );
      submit.type = 'submit';
      form.append(reason, label, submit);
      // 사유와 종료일을 전송하고 결과를 다시 조회합니다. 해제할 때는 blocked를 false로 보냅니다.
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        message('');
        try {
          await api(`/api/account/admin/users/${user.user_id}/restriction`, {
            method: 'PATCH',
            body: {
              blocked: !user.report_blocked,
              reason: reason.value,
              until: until.value ? new Date(until.value).toISOString() : null,
            },
          });
          await load();
          message('사용자 신고 제한 상태를 변경했습니다.', false);
        } catch (error) {
          message(error.message);
          submit.disabled = false;
        }
      });
      card.append(form);
    }
    list.append(card);
  }
  // 총 인원수로 페이지 수를 계산하고 이전·다음 버튼 상태를 맞춥니다.
  document.querySelector('#page').textContent =
    `${page} / ${Math.max(1, Math.ceil(data.total / data.limit))} · 총 ${data.total}명`;
  document.querySelector('#prev').disabled = page === 1;
  document.querySelector('#next').disabled = page * data.limit >= data.total;
}

// 조회에 실패하면 메시지를 표시해 새로고침으로 재시도할 수 있게 합니다.
async function refresh() {
  message('');
  try {
    await load();
  } catch (error) {
    message(error.message);
  }
}

// 검색 조건이 바뀌면 첫 페이지부터 다시 조회합니다.
bindForm('#searchUsers', async (body) => {
  page = 1;
  q = body.q;
  await load();
});
document.querySelector('#prev').addEventListener('click', () => {
  page--;
  refresh();
});
document.querySelector('#next').addEventListener('click', () => {
  page++;
  refresh();
});
document.querySelector('#retry').addEventListener('click', refresh);

// 관리자 확인을 통과한 경우에만 본문을 열고 사용자 목록을 조회합니다.
if (await requireUser({ admin: true })) {
  document.querySelector('main').hidden = false;
  await refresh();
}

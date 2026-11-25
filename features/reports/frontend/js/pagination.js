// [B] 마지막 항목 삭제 시에도 이전 페이지로 돌아갈 수 있는 목록 이동 UI입니다.
export function createPagination(container, load) {
  let page = 1;
  const nav = document.createElement('nav');
  nav.className = 'report-pagination';
  nav.setAttribute('aria-label', '신고 목록 페이지');
  const previous = document.createElement('button');
  const next = document.createElement('button');
  const label = document.createElement('span');
  label.setAttribute('aria-live', 'polite');
  for (const button of [previous, next]) { button.type = 'button'; button.className = 'btn btn-secondary'; }
  previous.textContent = '이전'; next.textContent = '다음';
  nav.append(previous, label, next); container.after(nav);
  previous.addEventListener('click', () => { if (page > 1) { page--; load(); } });
  next.addEventListener('click', () => { page++; load(); });
  return {
    get page() { return page; },
    reset() { page = 1; },
    loading() { previous.disabled = true; next.disabled = true; },
    error() { previous.disabled = page <= 1; next.disabled = true; },
    update({ total, limit }) {
      const pages = Math.max(1, Math.ceil(total / limit));
      label.textContent = `${page} / ${pages} 페이지 · 총 ${total}건`;
      previous.disabled = page <= 1; next.disabled = page >= pages;
    },
  };
}

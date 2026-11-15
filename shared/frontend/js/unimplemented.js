// [A] 아직 만들지 않은 버튼·폼은 성공한 것처럼 처리하지 않고 구현 필요 안내를 표시합니다.

import './layout.js';

// 문서에서 클릭을 한 번에 받되 미구현 표시가 붙은 버튼·링크만 처리합니다.
document.addEventListener('click', (event) => {
  const control = event.target.closest('button[data-unimplemented], a[data-unimplemented]');
  if (!control) {
    return;
  }
  event.preventDefault();
  window.alert(`구현 필요(${control.dataset.unimplemented})`);
});

// Enter로 폼을 제출한 경우에도 실제 저장 대신 같은 안내를 표시합니다.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.matches('form[data-unimplemented]')) {
    return;
  }
  event.preventDefault();
  window.alert(`구현 필요(${form.dataset.unimplemented})`);
});

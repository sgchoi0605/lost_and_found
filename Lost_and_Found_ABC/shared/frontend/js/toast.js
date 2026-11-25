// [A] 화면 아래에 잠깐 나타나는 안내 메시지를 표시합니다.

export function showToast(message) {
  let toast = document.querySelector('#toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.append(toast);
  }
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

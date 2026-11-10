export function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) { toast = document.createElement("div"); toast.className = "toast"; document.body.append(toast); }
  toast.textContent = message; toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 3000);
}

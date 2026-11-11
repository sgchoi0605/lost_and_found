document.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-unimplemented], a[data-unimplemented]");
  if (!control) return;
  event.preventDefault();
  window.alert(`구현 필요(${control.dataset.unimplemented})`);
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!form.matches("form[data-unimplemented]")) return;
  event.preventDefault();
  window.alert(`구현 필요(${form.dataset.unimplemented})`);
});

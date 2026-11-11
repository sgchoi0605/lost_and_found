import "../../../../shared/frontend/js/unimplemented.js";

const notificationButton = document.querySelector("#notificationButton");
const notificationDrawer = document.querySelector("#notificationDrawer");

notificationButton?.addEventListener("click", () => {
  notificationDrawer.hidden = false;
});

notificationDrawer?.addEventListener("click", (event) => {
  if (event.target === notificationDrawer || event.target.closest("[data-close-drawer]")) {
    notificationDrawer.hidden = true;
  }
});

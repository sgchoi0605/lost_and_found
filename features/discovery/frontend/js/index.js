import { showToast } from "../../../../shared/frontend/js/toast.js";
document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => showToast("데모 화면입니다. 실제 처리는 다음 단계에서 구현합니다."));
});

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

const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const foundCards = [...document.querySelectorAll(".found-card")];
const emptyState = document.querySelector("#emptyState");

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const keyword = searchInput.value.trim().toLowerCase();
  let visibleCount = 0;

  foundCards.forEach((card) => {
    const matches = card.dataset.name.toLowerCase().includes(keyword);
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  emptyState.hidden = visibleCount !== 0;
  showToast(keyword ? `"${searchInput.value}" 검색 결과입니다.` : "동작구 전체 습득물을 보여드려요.");
});

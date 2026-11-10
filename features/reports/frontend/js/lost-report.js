import { showToast } from "../../../../shared/frontend/js/toast.js";
document.querySelector("#reportForm")?.addEventListener("submit", (event) => { event.preventDefault(); showToast("데모 화면입니다. 신고는 저장되지 않습니다."); });
const photoInput = document.querySelector("#itemPhoto");
const fileName = document.querySelector("#fileName");
photoInput?.addEventListener("change", () => {
  fileName.textContent = photoInput.files[0]?.name || "JPG, PNG · 최대 10MB";
});

import "../../../../shared/frontend/js/unimplemented.js";
const photoInput = document.querySelector("#itemPhoto");
const fileName = document.querySelector("#fileName");
photoInput?.addEventListener("change", () => {
  fileName.textContent = photoInput.files[0]?.name || "JPG, PNG · 최대 10MB";
});

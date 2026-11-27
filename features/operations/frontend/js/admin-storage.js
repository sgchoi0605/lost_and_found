
// Хадгалалтын бодит өгөгдөл
// Backend API холбогдоогүй тул одоогоор хоосон байна.
const storageItems = [];

// HTML элементүүд
const totalCount = document.getElementById("total-count");
const storedCount = document.getElementById("stored-count");
const pendingCount = document.getElementById("pending-count");

const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");

const tableBody = document.getElementById("storage-table-body");
const emptyMessage = document.getElementById("empty-message");

// Тоонуудыг шинэчлэх
function updateSummary() {
    if (!totalCount || !storedCount || !pendingCount) return;

    totalCount.textContent = storageItems.length;

    storedCount.textContent = storageItems.filter(
        item => item.status === "보관 중"
    ).length;

    pendingCount.textContent = storageItems.filter(
        item => item.status === "인계 대기"
    ).length;
}

// Хүснэгтийг харуулах
function renderStorageItems() {
    if (!tableBody || !searchInput || !statusFilter) return;

    const keyword = searchInput.value.trim().toLowerCase();
    const selectedStatus = statusFilter.value;

    const filteredItems = storageItems.filter(item => {
        const matchesName = String(item.name || "")
            .toLowerCase()
            .includes(keyword);

        const matchesStatus =
            selectedStatus === "all" ||
            item.status === selectedStatus;

        return matchesName && matchesStatus;
    });

    // Өмнөх мөрүүдийг цэвэрлэх
    tableBody.replaceChildren();

    filteredItems.forEach(item => {
        const row = document.createElement("tr");

        const nameCell = document.createElement("td");
        nameCell.textContent = item.name || "정보 없음";

        const dateCell = document.createElement("td");
        dateCell.textContent = item.date || "정보 없음";

        const locationCell = document.createElement("td");
        locationCell.textContent = item.location || "정보 없음";

        const statusCell = document.createElement("td");
        statusCell.textContent = item.status || "정보 없음";

        row.append(
            nameCell,
            dateCell,
            locationCell,
            statusCell
        );

        tableBody.appendChild(row);
    });

    // Хоосон мэдээллийн мессеж
    if (emptyMessage) {
        emptyMessage.hidden = filteredItems.length > 0;
    }
}

// Хайлт болон шүүлтүүр
if (searchInput) {
    searchInput.addEventListener("input", renderStorageItems);
}

if (statusFilter) {
    statusFilter.addEventListener("change", renderStorageItems);
}

// Эхлүүлэх
updateSummary();
renderStorageItems();

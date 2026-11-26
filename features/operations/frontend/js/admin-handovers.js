
// localStorage мэдээлэл авах
function getStorageData(key, fallback) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return data ?? fallback;
    } catch {
        return fallback;
    }
}

// Бодит хүсэлтүүд
const newApplications = getStorageData(
    "newHandoverApplications",
    []
);

const statuses = getStorageData(
    "handoverStatuses",
    {}
);

// Хуурамч sample data ашиглахгүй
const allApplications = Array.isArray(newApplications)
    ? newApplications
    : [];

// HTML элементүүд
const tableBody = document.getElementById("handovers-table-body");
const emptyMessage = document.getElementById("handovers-empty-message");

const allCount = document.getElementById("all-count");
const waitingCount = document.getElementById("waiting-count");
const completedCount = document.getElementById("completed-count");

const searchInput = document.getElementById("handover-search");
const filterSelect = document.getElementById("handover-filter");

// Төлөв авах
function getCurrentStatus(item) {
    return statuses[String(item.id)] ||
        item.status ||
        "인계 대기";
}

// Хүснэгт харуулах
function renderApplications() {
    if (!tableBody || !searchInput || !filterSelect) return;

    tableBody.replaceChildren();

    const searchText = searchInput.value.trim().toLowerCase();
    const selectedFilter = filterSelect.value;

    // Хайлт болон төлөвийн шүүлтүүр
    const filteredApplications = allApplications.filter(item => {
        const status = getCurrentStatus(item);

        const matchesSearch =
            String(item.itemName || "").toLowerCase().includes(searchText) ||
            String(item.applicant || "").toLowerCase().includes(searchText);

        const matchesStatus =
            selectedFilter === "all" ||
            status === selectedFilter;

        return matchesSearch && matchesStatus;
    });

    // Статистик
    if (allCount) {
        allCount.textContent = allApplications.length;
    }

    if (waitingCount) {
        waitingCount.textContent = allApplications.filter(
            item => getCurrentStatus(item) === "인계 대기"
        ).length;
    }

    if (completedCount) {
        completedCount.textContent = allApplications.filter(
            item => getCurrentStatus(item) === "인계 완료"
        ).length;
    }

    // Хоосон эсэх
    if (emptyMessage) {
        emptyMessage.hidden = filteredApplications.length > 0;
    }

    // Мөр үүсгэх
    filteredApplications.forEach(item => {
        const row = document.createElement("tr");

        const itemCell = document.createElement("td");
        itemCell.textContent = item.itemName || "물품명 없음";

        const applicantCell = document.createElement("td");
        applicantCell.textContent = item.applicant || "정보 없음";

        const dateCell = document.createElement("td");
        dateCell.textContent = item.date || "정보 없음";

        const statusCell = document.createElement("td");
        statusCell.textContent = getCurrentStatus(item);

        const detailCell = document.createElement("td");
        const detailLink = document.createElement("a");

        detailLink.href =
            `./admin-handover-detail.html?id=${encodeURIComponent(item.id)}`;

        detailLink.textContent = "상세 보기";

        detailCell.appendChild(detailLink);

        row.append(
            itemCell,
            applicantCell,
            dateCell,
            statusCell,
            detailCell
        );

        tableBody.appendChild(row);
    });
}

// Хайлт болон шүүлтүүр
if (searchInput) {
    searchInput.addEventListener("input", renderApplications);
}

if (filterSelect) {
    filterSelect.addEventListener("change", renderApplications);
}

// Эхлүүлэх
renderApplications();

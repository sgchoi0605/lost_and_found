
// localStorage мэдээлэл авах
function getStorageData(key, fallback) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return data ?? fallback;
    } catch {
        return fallback;
    }
}

// Хүсэлт болон төлөвийн мэдээлэл
const applications = getStorageData(
    "newHandoverApplications",
    []
);

const statuses = getStorageData(
    "handoverStatuses",
    {}
);

const itemDetails = getStorageData(
    "handoverItemDetails",
    {}
);

const completionDetails = getStorageData(
    "handoverCompletionDetails",
    {}
);

// HTML элементүүд
const handoverList = document.getElementById("handover-list");
const emptyMessage = document.getElementById("empty-message");

// Төлөв харуулах
function renderApplications() {
    if (!handoverList) return;

    handoverList.replaceChildren();

    // Хүсэлт байхгүй үед
    if (!Array.isArray(applications) || applications.length === 0) {
        if (emptyMessage) {
            emptyMessage.hidden = false;
        }
        return;
    }

    if (emptyMessage) {
        emptyMessage.hidden = true;
    }

    // Хүсэлт бүрийг харуулах
    applications.forEach(item => {
        const id = String(item.id);

        const details = itemDetails[id] || {};
        const completion = completionDetails[id] || {};

        const currentStatus =
            statuses[id] || item.status || "인계 대기";

        const card = document.createElement("div");
        card.className = "detail-card";

        // Үндсэн мэдээлэл
        const fields = [
            ["물품명", item.itemName],
            ["신청자", item.applicant],
            ["연락처", item.contact],
            ["신청 날짜", item.date],
            ["신청 사유", item.reason],
            ["습득 날짜", details.foundDate || item.foundDate],
            ["보관 장소", details.location || item.location],
            ["처리 상태", currentStatus]
        ];

        // Зөвхөн бодитоор хүлээлгэн өгсөн үед харуулах
        if (currentStatus === "인계 완료") {
            fields.push(
                ["인계 완료 날짜", completion.completionDate],
                ["실제 수령자 이름", completion.recipientName]
            );
        }

        fields.forEach(([label, value]) => {
            const paragraph = document.createElement("p");

            paragraph.textContent =
                `${label}: ${value || "아직 등록되지 않음"}`;

            card.appendChild(paragraph);
        });

        handoverList.appendChild(card);
    });
}

// Эхлүүлэх
renderApplications();

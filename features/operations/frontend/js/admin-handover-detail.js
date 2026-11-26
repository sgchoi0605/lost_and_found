
// URL-аас хүсэлтийн ID авах
const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

// ID байхгүй бол хүсэлтийн жагсаалт руу буцах
if (!requestId) {
    window.location.replace("./admin-handovers.html");
}

// localStorage мэдээлэл авах
function getStorageData(key, fallback) {
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return data ?? fallback;
    } catch {
        return fallback;
    }
}

// HTML элементүүд
const detailContainer = document.querySelector(".detail-container");

const itemName = document.getElementById("item-name");
const foundDateInput = document.getElementById("found-date-input");
const storageLocationInput = document.getElementById("storage-location-input");
const saveItemInfoButton = document.getElementById("save-item-info-button");
const itemInfoMessage = document.getElementById("item-info-message");

const applicantName = document.getElementById("applicant-name");
const applicantContact = document.getElementById("applicant-contact");
const applicationReason = document.getElementById("application-reason");

const approveButton = document.getElementById("approve-button");
const rejectButton = document.getElementById("reject-button");
const resetStatusButton = document.getElementById("reset-status-button");

const applicationStatus = document.getElementById("application-status");
const resultMessage = document.getElementById("result-message");

const completionDateInput =
    document.getElementById("completion-date-input");

const recipientNameInput =
    document.getElementById("recipient-name-input");

const completeHandoverButton =
    document.getElementById("complete-handover-button");

const completionMessage =
    document.getElementById("completion-message");

// Хадгалсан мэдээллүүд
const newApplications = getStorageData(
    "newHandoverApplications",
    []
);

const savedStatuses = getStorageData(
    "handoverStatuses",
    {}
);

const savedItemDetails = getStorageData(
    "handoverItemDetails",
    {}
);

const completionDetails = getStorageData(
    "handoverCompletionDetails",
    {}
);

// Зөвхөн бодит хүсэлт ашиглах
const allHandoverItems = Array.isArray(newApplications)
    ? newApplications
    : [];

// Сонгосон хүсэлтийг олох
const selectedItem = allHandoverItems.find(
    item => String(item.id) === String(requestId)
);

// Одоогийн төлөв авах
function getCurrentStatus() {
    if (!selectedItem) return "";

    return savedStatuses[String(requestId)] ||
        selectedItem.status ||
        "인계 대기";
}

// Мэдээлэл харуулах
function renderDetail() {
    if (!selectedItem) {
        if (detailContainer) {
            detailContainer.textContent =
                "해당 신청을 찾을 수 없습니다.";
        }
        return;
    }

    const id = String(requestId);

    const itemDetails = savedItemDetails[id] || {};
    const completion = completionDetails[id] || {};

    // Барааны мэдээлэл
    if (itemName) {
        itemName.textContent =
            selectedItem.itemName || "물품 정보 없음";
    }

    if (foundDateInput) {
        const savedFoundDate =
            itemDetails.foundDate ||
            selectedItem.foundDate ||
            "";

        const isValidDate =
            /^\d{4}-\d{2}-\d{2}$/.test(savedFoundDate);

        foundDateInput.value = isValidDate
            ? savedFoundDate
            : "";
    }

    if (storageLocationInput) {
        storageLocationInput.value =
            itemDetails.location ||
            selectedItem.location ||
            "";
    }

    // Хүсэлт гаргагчийн мэдээлэл
    if (applicantName) {
        applicantName.textContent =
            selectedItem.applicant || "정보 없음";
    }

    if (applicantContact) {
        applicantContact.textContent =
            selectedItem.contact || "정보 없음";
    }

    if (applicationReason) {
        applicationReason.textContent =
            selectedItem.reason || "정보 없음";
    }

    // Төлөв
    const currentStatus = getCurrentStatus();

    if (applicationStatus) {
        applicationStatus.textContent =
            `현재 상태: ${currentStatus}`;
    }

    const isPending = currentStatus === "인계 대기";
    const isApproved = currentStatus === "인계 승인 완료";
    const isCompleted = currentStatus === "인계 완료";

    if (approveButton) {
        approveButton.disabled = !isPending;
    }

    if (rejectButton) {
        rejectButton.disabled = !isPending;
    }

    if (resetStatusButton) {
        resetStatusButton.disabled =
            isPending || isCompleted;
    }

    // Бодит хүлээлгэн өгсөн мэдээлэл
    if (completionDateInput) {
        completionDateInput.value =
            completion.completionDate || "";

        completionDateInput.disabled = !isApproved;
    }

    if (recipientNameInput) {
        recipientNameInput.value =
            completion.recipientName || "";

        recipientNameInput.disabled = !isApproved;
    }

    if (completeHandoverButton) {
        completeHandoverButton.disabled = !isApproved;
    }

    if (completionMessage) {
        if (isCompleted) {
            completionMessage.textContent =
                `인계 완료: ${completion.completionDate || "날짜 정보 없음"} / 수령자: ${completion.recipientName || "정보 없음"}`;
        } else if (isApproved) {
            completionMessage.textContent =
                "실제 인계가 끝난 후 날짜와 수령자 이름을 입력해 주세요.";
        } else {
            completionMessage.textContent =
                "인계 승인 완료 상태에서만 실제 인계를 완료할 수 있습니다.";
        }
    }
}

// Барааны мэдээлэл хадгалах
function saveItemInfo() {
    if (!selectedItem) return;

    const foundDate = foundDateInput?.value || "";
    const location = storageLocationInput?.value.trim() || "";

    if (!foundDate || !location) {
        if (itemInfoMessage) {
            itemInfoMessage.textContent =
                "습득 날짜와 보관 장소를 모두 입력해 주세요.";
        }
        return;
    }

    savedItemDetails[String(requestId)] = {
        foundDate,
        location
    };

    localStorage.setItem(
        "handoverItemDetails",
        JSON.stringify(savedItemDetails)
    );

    if (itemInfoMessage) {
        itemInfoMessage.textContent =
            "물품 정보가 저장되었습니다.";
    }
}

// Хүсэлтийг зөвшөөрөх эсвэл татгалзах
function updateStatus(newStatus, message) {
    if (!selectedItem) return;

    if (getCurrentStatus() !== "인계 대기") {
        if (resultMessage) {
            resultMessage.textContent =
                "이미 처리된 신청입니다.";
        }
        return;
    }

    savedStatuses[String(requestId)] = newStatus;

    localStorage.setItem(
        "handoverStatuses",
        JSON.stringify(savedStatuses)
    );

    if (resultMessage) {
        resultMessage.textContent = message;
    }

    renderDetail();
}

// Бодитоор хүлээлгэн өгч дуусгах
function completeHandover() {
    if (!selectedItem) return;

    if (getCurrentStatus() !== "인계 승인 완료") {
        if (completionMessage) {
            completionMessage.textContent =
                "먼저 인계 신청을 승인해 주세요.";
        }
        return;
    }

    const completionDate = completionDateInput?.value || "";
    const recipientName = recipientNameInput?.value.trim() || "";

    if (!completionDate || !recipientName) {
        if (completionMessage) {
            completionMessage.textContent =
                "인계 완료 날짜와 실제 수령자 이름을 모두 입력해 주세요.";
        }
        return;
    }

    const id = String(requestId);

    completionDetails[id] = {
        completionDate,
        recipientName
    };

    localStorage.setItem(
        "handoverCompletionDetails",
        JSON.stringify(completionDetails)
    );

    savedStatuses[id] = "인계 완료";

    localStorage.setItem(
        "handoverStatuses",
        JSON.stringify(savedStatuses)
    );

    if (completionMessage) {
        completionMessage.textContent =
            "실제 인계가 완료되었습니다.";
    }

    if (resultMessage) {
        resultMessage.textContent =
            "인계 완료 처리가 저장되었습니다.";
    }

    renderDetail();
}

// Төлөвийг буцаах
function resetStatus() {
    if (!selectedItem) return;

    const currentStatus = getCurrentStatus();

    if (currentStatus === "인계 대기") {
        if (resultMessage) {
            resultMessage.textContent =
                "이미 대기 상태입니다.";
        }
        return;
    }

    // Бодит 인계 완료 болсон хүсэлтийг буцаахгүй
    if (currentStatus === "인계 완료") {
        if (resultMessage) {
            resultMessage.textContent =
                "실제 인계가 완료된 신청은 초기화할 수 없습니다.";
        }
        return;
    }

    const id = String(requestId);

    savedStatuses[id] = "인계 대기";

    delete completionDetails[id];

    localStorage.setItem(
        "handoverStatuses",
        JSON.stringify(savedStatuses)
    );

    localStorage.setItem(
        "handoverCompletionDetails",
        JSON.stringify(completionDetails)
    );

    if (resultMessage) {
        resultMessage.textContent =
            "신청 상태가 대기 상태로 변경되었습니다.";
    }

    renderDetail();
}

// Товчнуудын event
if (saveItemInfoButton) {
    saveItemInfoButton.addEventListener(
        "click",
        saveItemInfo
    );
}

if (approveButton) {
    approveButton.addEventListener("click", () => {
        updateStatus(
            "인계 승인 완료",
            "인계 신청이 승인되었습니다."
        );
    });
}

if (rejectButton) {
    rejectButton.addEventListener("click", () => {
        updateStatus(
            "신청 거절",
            "인계 신청이 거절되었습니다."
        );
    });
}

if (resetStatusButton) {
    resetStatusButton.addEventListener(
        "click",
        resetStatus
    );
}

if (completeHandoverButton) {
    completeHandoverButton.addEventListener(
        "click",
        completeHandover
    );
}

// Эхлүүлэх
renderDetail();

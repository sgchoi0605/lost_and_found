
const form = document.getElementById("handover-form");
const resultMessage = document.getElementById("result-message");

// Форм байхгүй бол зогсоно
if (form) {
    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const itemName =
            document.getElementById("item-name")?.value.trim() || "";

        const applicantName =
            document.getElementById("applicant-name")?.value.trim() || "";

        const phone =
            document.getElementById("phone")?.value.trim() || "";

        const description =
            document.getElementById("description")?.value.trim() || "";

        // Мэдээлэл шалгах
        if (!itemName || !applicantName || !phone || !description) {
            if (resultMessage) {
                resultMessage.textContent =
                    "모든 항목을 입력해 주세요.";
                resultMessage.style.color = "red";
            }
            return;
        }

        // Огноо үүсгэх
        const today = new Date();

        const date = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");

        // Шинэ хүсэлт
        const newApplication = {
            id: Date.now(),
            itemName,
            applicant: applicantName,
            contact: phone,
            reason: description,
            date,
            foundDate: "",
            location: "",
            status: "인계 대기"
        };

        // Өмнөх хүсэлтүүдийг авах
        let applications = [];

        try {
            const savedData = JSON.parse(
                localStorage.getItem("newHandoverApplications") || "[]"
            );

            if (Array.isArray(savedData)) {
                applications = savedData;
            }
        } catch (error) {
            if (resultMessage) {
                resultMessage.textContent =
                    "저장된 신청 정보를 불러오지 못했습니다.";
                resultMessage.style.color = "red";
            }
            return;
        }

        // Шинэ хүсэлт нэмэх
        applications.push(newApplication);

        // Хадгалах
        try {
            localStorage.setItem(
                "newHandoverApplications",
                JSON.stringify(applications)
            );
        } catch (error) {
            if (resultMessage) {
                resultMessage.textContent =
                    "신청 정보를 저장하지 못했습니다.";
                resultMessage.style.color = "red";
            }
            return;
        }

        // Амжилттай
        if (resultMessage) {
            resultMessage.textContent =
                "인계 신청이 완료되었습니다.";
            resultMessage.style.color = "green";
        }

        form.reset();
    });
}

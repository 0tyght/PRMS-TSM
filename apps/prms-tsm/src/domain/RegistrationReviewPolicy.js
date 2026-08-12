const CLOSED_STATUSES = Object.freeze(["APPROVED", "REJECTED", "CANCELLED"]);

export class RegistrationReviewPolicy {
  isClosed(status) {
    return CLOSED_STATUSES.includes(status);
  }

  isUrgent(item) {
    return item?.status === "SUBMITTED" && Number(item.ageDays || 0) >= 3;
  }

  ageLabel(item) {
    const days = Number(item?.ageDays || 0);
    if (days <= 0) return "วันนี้";
    if (days === 1) return "1 วัน";
    return `${days.toLocaleString("th-TH")} วัน`;
  }

  sourceLabel(item) {
    return item?.sourceType === "CITIZEN_SUBMISSION" ? "LINE Official Account" : "ข้อมูลขึ้นทะเบียน";
  }
}

export const registrationReviewPolicy = new RegistrationReviewPolicy();

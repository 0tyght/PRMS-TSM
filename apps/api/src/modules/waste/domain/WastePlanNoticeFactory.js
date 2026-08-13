const thaiDate = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "full",
  timeZone: "Asia/Bangkok",
});

const thaiTime = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

export class WastePlanNoticeFactory {
  formatPublished(plan) {
    const date = thaiDate.format(new Date(`${plan.scheduledDate}T12:00:00+07:00`));
    const start = thaiTime.format(new Date(plan.scheduledStartAt));
    const end = thaiTime.format(new Date(plan.scheduledEndAt));
    const note = plan.publicNote ? `\nหมายเหตุ: ${plan.publicNote}` : "";
    return [
      "เทศบาลท่าโพธ์ แจ้งกำหนดการเก็บขยะประจำพื้นที่",
      date,
      `เวลาโดยประมาณ ${start}–${end} น.`,
      `${plan.routeCode} ${plan.routeName}`,
      "กรุณารวบรวมขยะใส่ถุงหรือภาชนะให้เรียบร้อย และวาง ณ จุดรับบริการก่อนเวลาเริ่มเก็บ",
      `เลขที่แผน ${plan.planNo}${note}`,
      "ตรวจสอบกำหนดล่าสุดได้จากเมนู “กำหนดเก็บขยะ”",
    ].join("\n");
  }

  formatWithdrawn(plan, reason) {
    const date = thaiDate.format(new Date(`${plan.scheduledDate}T12:00:00+07:00`));
    return [
      "เทศบาลท่าโพธ์ แจ้งถอนกำหนดการเก็บขยะ",
      date,
      `${plan.routeCode} ${plan.routeName}`,
      `เหตุผล: ${reason}`,
      "เทศบาลจะแจ้งกำหนดการใหม่ผ่าน LINE เมื่อจัดแผนเรียบร้อย",
      `เลขที่แผน ${plan.planNo}`,
    ].join("\n");
  }
}

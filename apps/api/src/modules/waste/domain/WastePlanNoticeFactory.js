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
      "เทศบาลเมืองท่าโพธิ์ แจ้งตารางกำหนดการเก็บขยะประจำพื้นที่",
      date,
      `เวลาโดยประมาณ ${start}–${end} น.`,
      `${plan.routeCode} ${plan.routeName}`,
      "กรุณารวบรวมขยะใส่ถุงหรือภาชนะให้เรียบร้อย และวาง ณ สถานที่รับบริการก่อนเวลาเริ่มเก็บ",
      `เลขที่แผน ${plan.planNo}${note}`,
      "ตรวจสอบตารางล่าสุดได้จากเมนู “ตารางกำหนดการ”",
    ].join("\n");
  }

  formatWithdrawn(plan, reason) {
    const date = thaiDate.format(new Date(`${plan.scheduledDate}T12:00:00+07:00`));
    return [
      "เทศบาลเมืองท่าโพธิ์ แจ้งยกเลิกตารางกำหนดการเก็บขยะประจำพื้นที่",
      date,
      `${plan.routeCode} ${plan.routeName}`,
      `เหตุผล: ${reason}`,
      "เทศบาลเมืองท่าโพธิ์จะแจ้งตารางฉบับปรับปรุงผ่าน LINE เมื่อจัดแผนปฏิบัติงานเก็บขยะเรียบร้อย",
      `เลขที่แผน ${plan.planNo}`,
    ].join("\n");
  }
}

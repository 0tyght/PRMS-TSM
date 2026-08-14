export class WasteChargeNoticeFactory {
  constructor({
    timeZone = "Asia/Bangkok",
  } = {}) {
    this.dateFormatter =
      new Intl.DateTimeFormat(
        "th-TH",
        {
          dateStyle: "medium",
          timeZone,
        },
      );

    this.currencyFormatter =
      new Intl.NumberFormat(
        "th-TH",
        {
          style: "currency",
          currency: "THB",
        },
      );
  }

  create(charge) {
    const dueDate =
      this.dateFormatter.format(
        new Date(
          charge.dueDate,
        ),
      );

    const amount =
      this.currencyFormatter.format(
        Number(
          charge.amount,
        ),
      );

    return [
      "แจ้งค่าบริการเก็บขยะ",
      `คุณ${charge.fullName}`,
      `ยอดชำระ ${amount}`,
      `กำหนดชำระ ${dueDate}`,
      "ตรวจสอบรายละเอียดได้โดยพิมพ์ “ค่าบริการขยะ”",
    ].join("\n");
  }
}

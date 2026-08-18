const MAX_QUICK_REPLIES = 13;

export class WasteLineShortcutCatalog {
  postback(label, data, displayText = label) {
    return { type: "postback", label: String(label).slice(0, 20), data: String(data).slice(0, 300), displayText: String(displayText).slice(0, 300) };
  }
  message(label, text = label) { return { type: "message", label: String(label).slice(0, 20), text: String(text).slice(0, 300) }; }
  location(label = "ส่งตำแหน่ง") { return { type: "location", label: String(label).slice(0, 20) }; }
  uri(label, uri) { return { type: "uri", label: String(label).slice(0, 20), uri }; }
  smartThaPhoHome() { return this.postback("Smart Tha Pho", "smart=menu", "กลับเมนูหลัก Smart Tha Pho"); }
  normalize(actions = []) {
    const seen = new Set();
    return actions.filter(Boolean).filter((action) => {
      const key = `${action.type}:${action.data || action.text || action.uri || action.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_QUICK_REPLIES);
  }
  menu(actors = {}) {
    const actions = actors.citizen
      ? [
          this.postback("ตารางกำหนดการ", "waste=citizen_schedule", "ตารางกำหนดการเก็บขยะประจำพื้นที่"),
          this.postback("ตำแหน่งรถ", "waste=citizen_location", "ดูตำแหน่งรถเก็บขยะ"),
          this.postback("ค่าบริการ", "waste=citizen_charges", "ตรวจสอบค่าบริการเก็บขยะ"),
        ]
      : [this.postback("ลงทะเบียนบริการ", "waste=register", "ลงทะเบียนบริการเก็บขยะ")];
    actions.push(this.smartThaPhoHome());
    return this.normalize(actions);
  }
  driverGuest() {
    return this.normalize([
      this.postback("ยืนยันตัวตน", "waste=driver_link", "ยืนยันตัวตนพนักงานประจำรถขยะ"),
    ]);
  }
  driverIdentity() {
    return this.normalize([
      this.postback("เริ่มใหม่", "waste=driver_link", "เริ่มยืนยันตัวตนพนักงานใหม่"),
      this.message("ยกเลิก", "ยกเลิกบริการขยะ"),
    ]);
  }
  citizen() {
    return this.normalize([
      this.postback("ตารางกำหนดการ", "waste=citizen_schedule", "ตารางกำหนดการเก็บขยะประจำพื้นที่"),
      this.postback("ตำแหน่งรถ", "waste=citizen_location", "ดูตำแหน่งรถเก็บขยะ"),
      this.postback("ค่าบริการ", "waste=citizen_charges", "ตรวจสอบค่าบริการเก็บขยะ"),
      this.postback("เมนูขยะ", "waste=menu", "กลับเมนูบริการเก็บขยะ"),
      this.smartThaPhoHome(),
    ]);
  }
  unregistered() {
    return this.normalize([
      this.postback("ลงทะเบียน", "waste=register", "ลงทะเบียนบริการเก็บขยะ"),
      this.postback("เมนูขยะ", "waste=menu", "กลับเมนูบริการเก็บขยะ"),
      this.smartThaPhoHome(),
    ]);
  }
  cancelFlow(extra = []) { return this.normalize([...extra, this.message("ยกเลิก", "ยกเลิกบริการขยะ"), this.smartThaPhoHome()]); }
  registration(step) {
    if (step === "ADDRESS") return this.cancelFlow([this.message("ข้าม", "ข้าม")]);
    if (step === "LOCATION") return this.cancelFlow([this.location("ส่งตำแหน่งบ้าน")]);
    if (step === "CONFIRM") return this.cancelFlow([this.message("ยืนยัน", "ยืนยัน")]);
    return this.cancelFlow();
  }
  registrationProgress(step) {
    const steps = [
      ["FULL_NAME", "ชื่อผู้ใช้บริการ"],
      ["PHONE", "หมายเลขโทรศัพท์"],
      ["HOUSE_NO", "บ้านเลขที่"],
      ["VILLAGE_NO", "หมู่บ้าน"],
      ["ADDRESS", "จุดสังเกต"],
      ["LOCATION", "ตำแหน่งบ้าน"],
      ["CONFIRM", "ยืนยันข้อมูล"],
    ];
    const index = Math.max(0, steps.findIndex(([id]) => id === step));
    return `ขั้นตอน ${index + 1}/${steps.length} · ${steps[index][1]}`;
  }
  driverOperationProgress(plan, { collectedStops = 0, stopTotal = 0 } = {}) {
    const labels = {
      SCHEDULED: "รอเริ่มงาน",
      IN_PROGRESS: "กำลังปฏิบัติงาน",
      INTERRUPTED: "หยุดชะงัก รอเจ้าหน้าที่ดำเนินการ",
      COMPLETED: "เสร็จสิ้น",
    };
    const collection = Number(stopTotal) > 0
      ? ` · เก็บแล้ว ${Number(collectedStops)}/${Number(stopTotal)} จุด`
      : "";
    return `สถานะงาน: ${labels[plan.status] || plan.status}${collection}`;
  }
  driverMenu() {
    return this.normalize([
      this.postback("งานของฉัน", "waste=driver_jobs", "ดูแผนปฏิบัติงานเก็บขยะที่ได้รับมอบหมาย"),
      this.postback("งานวันนี้", "waste=driver_jobs_today", "ดูงานเก็บขยะวันนี้"),
      this.postback("งานล่วงหน้า", "waste=driver_jobs_upcoming", "ดูงานเก็บขยะล่วงหน้า"),
      this.postback("วิธีใช้งาน", "waste=driver_help", "วิธีใช้งานระบบพนักงานประจำรถขยะ"),
      this.postback("เมนูพนักงาน", "waste=menu", "กลับเมนูพนักงานประจำรถขยะ"),
    ]);
  }
  driverCancelFlow(extra = []) { return this.normalize([...extra, this.message("ยกเลิก", "ยกเลิกบริการขยะ"), ...this.driverMenu()]); }
  activePlan(plan) {
    return this.normalize([
      this.postback("ยืนยันการเก็บขยะ", `waste=driver_stops&planId=${plan.id}`, `ยืนยันการเก็บขยะ ${plan.planNo}`),
      this.postback("แจ้งเหตุ", `waste=driver_incident&planId=${plan.id}`, `แจ้งเหตุ ${plan.planNo}`),
      this.postback("เปิด GPS ต่อเนื่อง", `waste=driver_gps&planId=${plan.id}`, `เปิด GPS ${plan.planNo}`),
      this.postback("ส่งตำแหน่งครั้งเดียว", `waste=driver_location&planId=${plan.id}`, `ส่งตำแหน่งรถ ${plan.planNo}`),
      this.postback("เสร็จสิ้น", `waste=driver_complete&planId=${plan.id}`, `เสร็จสิ้น ${plan.planNo}`),
      ...this.driverMenu(),
    ]);
  }
  incidentTypes(plan) {
    const types = [
      ["VEHICLE_BREAKDOWN", "รถขัดข้อง"],
      ["ACCIDENT", "อุบัติเหตุ"],
      ["ROAD_CLOSED", "ถนนปิด"],
      ["ACCESS_BLOCKED", "เข้าพื้นที่ไม่ได้"],
      ["OTHER", "เหตุอื่น ๆ"],
    ];
    return this.driverCancelFlow(
      types.map(([type, label]) => this.postback(
        label,
        `waste=driver_incident_type&planId=${plan.id}&incidentType=${type}`,
        `แจ้งเหตุ ${label} ${plan.planNo}`,
      )),
    );
  }
  jobs(plans = []) {
    return this.normalize([
      ...plans.map((plan) => this.postback(`ดู ${String(plan.planNo).slice(-7)}`, `waste=driver_plan&planId=${plan.id}`, `ดูงาน ${plan.planNo}`)),
      ...this.driverMenu(),
    ]);
  }
  driverLocation() { return this.driverCancelFlow([this.location("ส่งตำแหน่งรถ")]); }
}

export const wasteLineShortcuts = new WasteLineShortcutCatalog();

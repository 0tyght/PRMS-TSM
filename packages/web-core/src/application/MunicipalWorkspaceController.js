import { getMunicipalSystem } from "@smart-thapho/shared";
import { SystemApplicationController } from "./SystemApplicationController.js";

const WORKSPACE_DETAILS = Object.freeze({
  waste: Object.freeze({ accent: "orange", mark: "ขย", groups: Object.freeze(["แผนการเก็บขยะ", "รถและพนักงาน", "เส้นทางปฏิบัติงาน", "การแจ้งเตือนผ่าน LINE"]) }),
  disaster: Object.freeze({ accent: "red", mark: "ภย", groups: Object.freeze(["รับแจ้งเหตุ", "สถานการณ์", "กำลังและทรัพยากร", "การแจ้งเตือนประชาชน"]) }),
  water: Object.freeze({ accent: "blue", mark: "ปร", groups: Object.freeze(["ผู้ใช้น้ำ", "มิเตอร์และการใช้น้ำ", "ค่าบริการ", "แจ้งเหตุการประปา"]) }),
});

export class MunicipalWorkspaceController extends SystemApplicationController {
  createViewModel(systemId) {
    const session = this.getSession();
    const system = getMunicipalSystem(systemId);
    const detail = WORKSPACE_DETAILS[systemId] || null;
    return Object.freeze({
      ...session,
      system,
      detail,
      ready: Boolean(session.authenticated && system && detail),
      initials: String(session.user?.name || "เจ้าหน้าที่").trim().slice(0, 2) || "จน",
    });
  }
}


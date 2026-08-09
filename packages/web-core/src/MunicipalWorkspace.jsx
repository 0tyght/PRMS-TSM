import { useEffect, useMemo } from "react";
import { getMunicipalSystem, PLATFORM } from "@smart-thapho/shared";
import { clearSession, getAccessToken, readSessionUser } from "./session.js";
import { getPortalUrl } from "./navigation.js";
import "./workspace.css";

const WORKSPACE_DETAILS = Object.freeze({
  waste: { accent: "orange", mark: "ขย", groups: ["แผนการเก็บขยะ", "รถและพนักงาน", "เส้นทางปฏิบัติงาน", "การแจ้งเตือนผ่าน LINE"] },
  disaster: { accent: "red", mark: "ภย", groups: ["รับแจ้งเหตุ", "สถานการณ์", "กำลังและทรัพยากร", "การแจ้งเตือนประชาชน"] },
  water: { accent: "blue", mark: "ปร", groups: ["ผู้ใช้น้ำ", "มิเตอร์และการใช้น้ำ", "ค่าบริการ", "แจ้งเหตุการประปา"] },
});

function initials(name) {
  return String(name || "เจ้าหน้าที่").trim().slice(0, 2) || "จน";
}

export function MunicipalWorkspace({ systemId }) {
  const token = getAccessToken();
  const system = getMunicipalSystem(systemId);
  const detail = WORKSPACE_DETAILS[systemId];
  const user = useMemo(() => readSessionUser(token), [token]);

  useEffect(() => {
    if (!token) window.location.replace(getPortalUrl());
  }, [token]);

  if (!token || !system || !detail) {
    return <main className="municipal-workspace__loading">กำลังตรวจสอบสิทธิ์เข้าใช้งาน…</main>;
  }

  const returnToPortal = () => window.location.assign(getPortalUrl());
  const logout = () => {
    clearSession();
    window.location.assign(getPortalUrl());
  };

  return (
    <main className={`municipal-workspace municipal-workspace--${detail.accent}`}>
      <header className="municipal-workspace__topbar">
        <div className="municipal-workspace__brand">
          <span className="municipal-workspace__brand-mark">ทพ</span>
          <span><strong>{PLATFORM.productName}</strong><small>{PLATFORM.municipalityName}</small></span>
        </div>
        <div className="municipal-workspace__actions">
          <span aria-label={`ผู้ใช้ ${user.name}`}>{initials(user.name)}</span>
          <button type="button" onClick={returnToPortal}>เปลี่ยนระบบ</button>
          <button type="button" onClick={logout}>ออกจากระบบ</button>
        </div>
      </header>
      <section className="municipal-workspace__content">
        <div className="municipal-workspace__heading">
          <span className="municipal-workspace__heading-mark">{detail.mark}</span>
          <div><p>{system.productName}</p><h1>{system.name}</h1><span>{PLATFORM.municipalityName}</span></div>
        </div>
        <section className="municipal-workspace__notice" aria-live="polite">
          <span className="municipal-workspace__notice-icon">i</span>
          <div><strong>เว็บระบบแยกพร้อมสำหรับเชื่อมต่อข้อมูลจริง</strong><p>ส่วนงานนี้จะแสดงเฉพาะข้อมูลที่เชื่อมจาก API และฐานข้อมูลของระบบนี้เมื่อพัฒนาโมดูลเสร็จ ไม่ใช้ข้อมูลจำลอง</p></div>
        </section>
        <section className="municipal-workspace__grid" aria-label={`ขอบเขต ${system.name}`}>
          {detail.groups.map((group, index) => <article key={group}><span>{String(index + 1).padStart(2, "0")}</span><h2>{group}</h2><p>พื้นที่ทำงานของเจ้าหน้าที่ในระบบนี้ จะแยกข้อมูลและสิทธิ์ตามระบบอย่างชัดเจน</p></article>)}
        </section>
      </section>
    </main>
  );
}

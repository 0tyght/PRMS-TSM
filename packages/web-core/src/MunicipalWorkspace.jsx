import { useEffect, useMemo } from "react";
import { PLATFORM } from "@smart-thapho/shared";
import { MunicipalWorkspaceController } from "./application/MunicipalWorkspaceController.js";
import "./workspace.css";

const workspaceController = new MunicipalWorkspaceController();

export function MunicipalWorkspace({ systemId }) {
  const viewModel = useMemo(() => workspaceController.createViewModel(systemId), [systemId]);
  const { token, system, detail, user, initials, ready } = viewModel;

  useEffect(() => {
    if (!token) workspaceController.redirectToLogin();
  }, [token]);

  if (!ready) {
    return <main className="municipal-workspace__loading">กำลังตรวจสอบสิทธิ์เข้าใช้งาน…</main>;
  }

  return (
    <main className={`municipal-workspace municipal-workspace--${detail.accent}`}>
      <header className="municipal-workspace__topbar">
        <div className="municipal-workspace__brand">
          <span className="municipal-workspace__brand-mark">ทพ</span>
          <span><strong>{PLATFORM.productName}</strong><small>{PLATFORM.municipalityName}</small></span>
        </div>
        <div className="municipal-workspace__actions">
          <span aria-label={`ผู้ใช้ ${user.name}`}>{initials}</span>
          <button type="button" onClick={() => workspaceController.switchSystem()}>เปลี่ยนระบบ</button>
          <button type="button" onClick={() => workspaceController.logout()}>ออกจากระบบ</button>
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

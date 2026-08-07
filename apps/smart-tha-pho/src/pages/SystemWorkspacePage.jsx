import { SMART_THA_PHO } from "../config/systems.js";

function initials(name = "เจ้าหน้าที่") {
  return String(name).trim().slice(0, 2) || "จน";
}

export default function SystemWorkspacePage({ system, user, onSwitchSystem, onLogout }) {
  return (
    <main className={`system-workspace system-workspace--${system.accent}`}>
      <header className="system-workspace__topbar">
        <div className="platform-brand">
          <span className="platform-brand__mark">ทพ</span>
          <span>
            <strong>{SMART_THA_PHO.productName}</strong>
            <small>{SMART_THA_PHO.municipalityName}</small>
          </span>
        </div>

        <div className="system-workspace__user">
          <span className="system-workspace__avatar">{initials(user?.name)}</span>
          <span>
            <strong>{user?.name || "เจ้าหน้าที่เทศบาล"}</strong>
            <small>{user?.role === "ADMIN" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}</small>
          </span>
          <button type="button" className="system-workspace__switch" onClick={onSwitchSystem}>เปลี่ยนระบบ</button>
          <button type="button" className="system-workspace__logout" onClick={onLogout}>ออกจากระบบ</button>
        </div>
      </header>

      <section className="system-workspace__content">
        <div className="system-workspace__heading">
          <div className="system-workspace__mark">{system.mark}</div>
          <div>
            <p>{system.productName}</p>
            <h1>{system.name}</h1>
            <span>{SMART_THA_PHO.municipalityName}</span>
          </div>
        </div>

        <section className="system-workspace__notice" aria-live="polite">
          <span aria-hidden="true">i</span>
          <div>
            <strong>ยังไม่มีข้อมูลปฏิบัติงานในระบบนี้</strong>
            <p>{system.integrationLabel} จึงยังไม่แสดงตัวเลขหรือข้อมูลจำลอง</p>
          </div>
        </section>

        <section className="system-workspace__grid" aria-label={`ขอบเขต ${system.name}`}>
          {system.groups.map((group, index) => (
            <article key={group}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{group}</h2>
              <p>เตรียมพื้นที่สำหรับเชื่อมข้อมูลและสิทธิ์การใช้งานของเจ้าหน้าที่ในระบบนี้</p>
            </article>
          ))}
        </section>

        <section className="system-workspace__footer-card">
          <div>
            <strong>แยกโมดูลชัดเจนบนแพลตฟอร์มเดียว</strong>
            <p>บัญชีเจ้าหน้าที่และการเข้าสู่ระบบใช้ร่วมกัน แต่ข้อมูลและสิทธิ์ของแต่ละระบบจะแยกจากกัน</p>
          </div>
          <button type="button" onClick={onSwitchSystem}>เลือกระบบอื่น</button>
        </section>
      </section>
    </main>
  );
}

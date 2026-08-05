import { useEffect, useMemo, useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { ADMIN_MENU } from "../../config/navigation.js";

const GROUPS = [
  { label: "ศูนย์ปฏิบัติการ", ids: ["dashboard", "registrations"] },
  { label: "ทะเบียนกลาง", ids: ["owners", "pets", "services"] },
  { label: "การบริหารระบบ", ids: ["settings"] },
];

const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  registrations: <><path d="M7 3h10v3H7z"/><path d="M5 6h14v15H5z"/><path d="M8 10h8M8 14h8M8 18h5"/></>,
  owners: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A4.5 4.5 0 0 1 21 19"/></>,
  pets: <><circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="5" cy="13" r="2"/><circle cx="19" cy="13" r="2"/><path d="M12 11c-3.3 0-6 2.3-6 5.1C6 18.8 8.4 21 12 21s6-2.2 6-4.9C18 13.3 15.3 11 12 11Z"/></>,
  services: <><path d="M7 4h10v16H7z"/><path d="M9.5 2v4M14.5 2v4M10 11h4M12 9v4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05-2.76 2.76-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V21H10v-.07A1.8 1.8 0 0 0 8.9 19.3a1.8 1.8 0 0 0-2 .36l-.05.05-2.76-2.76.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.85 13H2v-4h.85A1.8 1.8 0 0 0 4.5 7.9a1.8 1.8 0 0 0-.36-2l-.05-.05L6.85 3.1l.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10 1.85V2h4v-.15a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.05-.05 2.76 2.76-.05.05a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21.15 9H22v4h-.85A1.8 1.8 0 0 0 19.4 15Z"/></>,
};

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name] || ICONS.dashboard}</svg>;
}

function Brand({ compact = false }) {
  return <div className={`shell-brand ${compact ? "is-compact" : ""}`}><span className="shell-brand__mark">ทพ</span><span className="shell-brand__copy"><strong>{ORGANIZATION.shortName}</strong><small>Pet Registration Management</small></span></div>;
}

function Sidebar({ page, navigate, open, close }) {
  const menu = useMemo(() => new Map(ADMIN_MENU.map((item) => [item.id, item])), []);
  const descriptions = {
    dashboard: "สถานการณ์และงานสำคัญ",
    registrations: "ข้อมูลจาก LINE และคำขอใหม่",
    owners: "บุคคล ที่อยู่ และการเชื่อม LINE",
    pets: "ทะเบียนสุนัขและแมว",
    services: "วัคซีนและการทำหมัน",
    settings: "สิทธิ์ ความปลอดภัย และบริการ",
  };
  return <>
    <button type="button" className={`shell-scrim ${open ? "is-visible" : ""}`} onClick={close} aria-label="ปิดเมนู" tabIndex={open ? 0 : -1}/>
    <aside className={`shell-sidebar ${open ? "is-open" : ""}`}>
      <div className="shell-sidebar__brand"><Brand/><button type="button" className="shell-sidebar__close" onClick={close} aria-label="ปิดเมนู">×</button></div>
      <div className="shell-sidebar__body">
        {GROUPS.map((group) => <section className="shell-nav-group" key={group.label}><p>{group.label}</p><nav aria-label={group.label}>
          {group.ids.map((id) => {
            const item = menu.get(id); if (!item) return null; const active = page === id;
            return <button type="button" key={id} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} onClick={() => { navigate(id); close(); }}>
              <span className="shell-nav-icon"><Icon name={id}/></span><span className="shell-nav-copy"><strong>{item.label}</strong><small>{descriptions[id]}</small></span><span className="shell-nav-arrow">›</span>
            </button>;
          })}
        </nav></section>)}
      </div>
      <div className="shell-line-card"><span className="shell-line-card__icon">LINE</span><div><strong>ช่องทางประชาชน</strong><small>รับข้อมูลผ่าน LINE OA / LIFF</small></div><button type="button" onClick={() => navigate("registrations")}>เปิดศูนย์รับข้อมูล</button></div>
    </aside>
  </>;
}

function Topbar({ title, onMenu, navigate, onLogout }) {
  return <header className="shell-topbar">
    <div className="shell-topbar__left"><button type="button" className="shell-menu-button" onClick={onMenu} aria-label="เปิดเมนูหลัก"><span/><span/><span/></button><div className="shell-topbar__brand"><Brand compact/></div><div className="shell-page-context"><small>ระบบงานเจ้าหน้าที่</small><strong>{title}</strong></div></div>
    <div className="shell-topbar__right"><button type="button" className="shell-line-status" onClick={() => navigate("registrations")} title="เปิดศูนย์รับข้อมูลจาก LINE"><i/><span><small>ข้อมูลประชาชน</small><strong>LINE OA / LIFF</strong></span></button><div className="shell-profile"><span>จท</span><div><strong>เจ้าหน้าที่ระบบ</strong><small>ผู้ดูแลระบบ</small></div></div><button type="button" className="shell-logout" onClick={onLogout}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg><span>ออกจากระบบ</span></button></div>
  </header>;
}

export default function AdminLayout({ page, navigate, title, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { const close = (event) => event.key === "Escape" && setMenuOpen(false); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  useEffect(() => { setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, [page]);
  return <div className="prms-shell"><Sidebar page={page} navigate={navigate} open={menuOpen} close={() => setMenuOpen(false)}/><Topbar title={title} navigate={navigate} onMenu={() => setMenuOpen(true)} onLogout={onLogout}/><main className="prms-main" aria-label={title}><div className="prms-main__inner">{children}</div></main></div>;
}

import { useEffect, useMemo, useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { ADMIN_MENU } from "../../config/navigation.js";

const MENU_GROUPS = [
  { label: "ปฏิบัติการ", ids: ["dashboard", "registrations"] },
  { label: "ทะเบียนกลาง", ids: ["owners", "pets", "services"] },
  { label: "ระบบ", ids: ["settings"] },
];

const MENU_COPY = {
  dashboard: "สถานการณ์และงานสำคัญ",
  registrations: "ข้อมูลใหม่จาก LINE และเว็บไซต์",
  owners: "ครัวเรือน เจ้าของ และบัญชี LINE",
  pets: "ทะเบียนสุนัขและแมวรายตัว",
  services: "วัคซีน ทำหมัน และงานติดตาม",
  settings: "ผู้ใช้ สิทธิ์ และการเชื่อมต่อ",
};

const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  registrations: (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  owners: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.5A4.5 4.5 0 0 1 21 19" />
    </>
  ),
  pets: (
    <>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="7" r="2" />
      <circle cx="5" cy="13" r="2" />
      <circle cx="19" cy="13" r="2" />
      <path d="M12 11c-3.3 0-6 2.3-6 5.1C6 18.8 8.4 21 12 21s6-2.2 6-4.9C18 13.3 15.3 11 12 11Z" />
    </>
  ),
  services: (
    <>
      <path d="M7 4h10v16H7z" />
      <path d="M9.5 2v4M14.5 2v4M10 12h4M12 10v4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05-2.76 2.76-.05-.05a1.8 1.8 0 0 0-2-.36A1.8 1.8 0 0 0 13.9 21H10a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-2 .36l-.05.05-2.76-2.76.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.85 13H2V9h.85A1.8 1.8 0 0 0 4.5 7.9a1.8 1.8 0 0 0-.36-2l-.05-.05L6.85 3.1l.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10 1.85V2h4v-.15a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.05-.05 2.76 2.76-.05.05a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21.15 9H22v4h-.85A1.8 1.8 0 0 0 19.4 15Z" />
    </>
  ),
};

function MenuIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name] || ICONS.dashboard}
    </svg>
  );
}

function Brand() {
  return (
    <div className="v6-brand">
      <span className="v6-brand__mark" aria-hidden="true">ทพ</span>
      <span className="v6-brand__text">
        <strong>{ORGANIZATION.shortName}</strong>
        <small>Pet Registration Management</small>
      </span>
    </div>
  );
}

function Sidebar({ page, navigate, open, close }) {
  const menuMap = useMemo(
    () => new Map(ADMIN_MENU.map((item) => [item.id, item])),
    [],
  );

  return (
    <>
      <button
        type="button"
        className={`v6-shell-scrim ${open ? "is-visible" : ""}`}
        onClick={close}
        aria-label="ปิดเมนู"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`v6-sidebar ${open ? "is-open" : ""}`}>
        <div className="v6-sidebar__brand">
          <Brand />
          <button type="button" className="v6-sidebar__close" onClick={close} aria-label="ปิดเมนู">×</button>
        </div>

        <div className="v6-sidebar__scroll">
          {MENU_GROUPS.map((group) => (
            <section className="v6-menu-group" key={group.label}>
              <p>{group.label}</p>
              <nav aria-label={group.label}>
                {group.ids.map((id) => {
                  const item = menuMap.get(id);
                  if (!item) return null;
                  const active = page === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={active ? "is-active" : ""}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        navigate(id);
                        close();
                      }}
                    >
                      <span className="v6-menu-icon"><MenuIcon name={id} /></span>
                      <span className="v6-menu-copy">
                        <strong>{item.label}</strong>
                        <small>{MENU_COPY[id]}</small>
                      </span>
                      <span className="v6-menu-arrow" aria-hidden="true">›</span>
                    </button>
                  );
                })}
              </nav>
            </section>
          ))}
        </div>

        <div className="v6-line-card">
          <span className="v6-line-card__badge">LINE</span>
          <div>
            <strong>ช่องทางประชาชน</strong>
            <small>LINE OA เชื่อมกับระบบกลาง</small>
          </div>
          <button type="button" onClick={() => navigate("registrations")}>เปิดศูนย์รับข้อมูล</button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ title, user, navigate, onMenu, onLogout }) {
  return (
    <header className="v6-topbar">
      <div className="v6-topbar__left">
        <button type="button" className="v6-menu-toggle" onClick={onMenu} aria-label="เปิดเมนู">
          <span /><span /><span />
        </button>
        <div className="v6-topbar__mobile-brand"><Brand /></div>
        <div className="v6-page-context">
          <small>ระบบงานเจ้าหน้าที่</small>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="v6-topbar__right">
        <button
          type="button"
          className="v6-line-status"
          onClick={() => navigate("registrations")}
          title="เปิดศูนย์รับข้อมูลจากประชาชน"
        >
          <i />
          <span>
            <small>ข้อมูลประชาชน</small>
            <strong>LINE OA</strong>
          </span>
        </button>

        <div className="v6-profile">
          <span>{String(user?.name || "จท").slice(0, 2)}</span>
          <div>
            <strong>{user?.name || "เจ้าหน้าที่เทศบาล"}</strong>
            <small>{user?.role === "ADMIN" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่"}</small>
          </div>
        </div>

        <button type="button" className="v6-logout" onClick={onLogout}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 17l5-5-5-5M15 12H3" />
            <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
          </svg>
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </header>
  );
}

export default function AdminLayout({ page, navigate, title, user, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  return (
    <div className="v6-shell">
      <Sidebar
        page={page}
        navigate={navigate}
        open={menuOpen}
        close={() => setMenuOpen(false)}
      />
      <Topbar
        title={title}
        user={user}
        navigate={navigate}
        onMenu={() => setMenuOpen(true)}
        onLogout={onLogout}
      />
      <main className="v6-main" aria-label={title}>
        <div className="v6-main__inner">{children}</div>
      </main>
    </div>
  );
}

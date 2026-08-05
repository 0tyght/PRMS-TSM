import { useEffect, useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { ADMIN_MENU } from "../../config/navigation.js";

const ICON_PATHS = {
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
      <path d="M9 5h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" />
      <path d="M5 3v18" />
      <path d="M3 7h4M3 12h4M3 17h4" />
      <path d="M12 9h5M12 13h5M12 17h3" />
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
      <path d="M12 3v18M3 12h18" />
      <path d="M7 5.5A8 8 0 0 1 18.5 17" opacity=".45" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05-2.76 2.76-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V21H10v-.07A1.8 1.8 0 0 0 8.9 19.3a1.8 1.8 0 0 0-2 .36l-.05.05-2.76-2.76.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.85 13H2v-4h.85A1.8 1.8 0 0 0 4.5 7.9a1.8 1.8 0 0 0-.36-2l-.05-.05L6.85 3.1l.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10 1.85V2h4v-.15a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 2-.36l.05-.05 2.76 2.76-.05.05a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21.15 9H22v4h-.85A1.8 1.8 0 0 0 19.4 15Z" />
    </>
  ),
};

function MenuIcon({ id, fallback }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[id] || <text x="12" y="16" textAnchor="middle">{fallback}</text>}
    </svg>
  );
}

function Header({ title, onMenu, onLogout }) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="menu-toggle"
          onClick={onMenu}
          aria-label="เปิดเมนูหลัก"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="brand-mark" aria-hidden="true">ทพ</div>
        <div className="brand">
          <strong>{ORGANIZATION.productName}</strong>
          <span>{ORGANIZATION.shortName}</span>
        </div>
      </div>

      <div className="topbar__context" aria-label="หน้าปัจจุบัน">
        <span>ระบบงานเจ้าหน้าที่</span>
        <strong>{title}</strong>
      </div>

      <div className="top-actions">
        <button
          type="button"
          className="round notification-button"
          aria-label="การแจ้งเตือน 3 รายการ"
          title="การแจ้งเตือน"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </svg>
          <i>3</i>
        </button>

        <div className="profile">
          <b>จท</b>
          <span>
            <strong>เจ้าหน้าที่ระบบ</strong>
            <small>ผู้ดูแลระบบ</small>
          </span>
        </div>

        <button type="button" className="signout" onClick={onLogout}>
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

function Sidebar({ page, navigate, open, close }) {
  return (
    <>
      <button
        type="button"
        className={`scrim ${open ? "show" : ""}`}
        onClick={close}
        aria-label="ปิดเมนู"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar__heading">
          <span>เมนูการทำงาน</span>
          <small>ทะเบียนและบริการสัตว์เลี้ยง</small>
        </div>

        <nav aria-label="เมนูหลัก">
          {ADMIN_MENU.map((item) => {
            const active = page === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  navigate(item.id);
                  close();
                }}
              >
                <i>
                  <MenuIcon id={item.id} fallback={item.icon} />
                </i>
                <span>{item.label}</span>
                <svg className="sidebar__chevron" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            );
          })}
        </nav>

        <div className="help">
          <div className="help__icon" aria-hidden="true">?</div>
          <div>
            <b>ศูนย์ช่วยเหลือ</b>
            <span>คู่มือและแจ้งปัญหาการใช้งาน</span>
          </div>
          <button type="button" title="คู่มือระบบอยู่ระหว่างจัดทำ">
            ดูคู่มือระบบ
          </button>
        </div>
      </aside>
    </>
  );
}

export default function AdminLayout({
  page,
  navigate,
  title,
  onLogout,
  children,
}) {
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  return (
    <div className="app-shell admin-shell-v2">
      <Header
        title={title}
        onMenu={() => setMobileMenu(true)}
        onLogout={onLogout}
      />
      <Sidebar
        page={page}
        navigate={navigate}
        open={mobileMenu}
        close={() => setMobileMenu(false)}
      />
      <main className="content page-enter" aria-label={title}>
        <div className="content__inner">{children}</div>
      </main>
    </div>
  );
}

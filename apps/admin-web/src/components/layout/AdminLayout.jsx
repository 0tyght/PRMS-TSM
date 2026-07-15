import { useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { ADMIN_MENU } from "../../config/navigation.js";

function Header({ onMenu, onLogout }) {
  return <header className="topbar"><button className="menu-toggle" onClick={onMenu} aria-label="เปิดเมนู">☰</button><div className="brand-mark">ทพ</div><div className="brand"><strong>{ORGANIZATION.productName}</strong><span>{ORGANIZATION.shortName}</span></div><div className="top-actions"><button className="round" aria-label="การแจ้งเตือน">◉<i>3</i></button><div className="profile"><b>จท</b><span><strong>เจ้าหน้าที่ระบบ</strong><small>ผู้ดูแลระบบ</small></span></div><button className="signout" onClick={onLogout}>ออกจากระบบ</button></div></header>;
}

function Sidebar({ page, navigate, open, close }) {
  return <><div className={`scrim ${open ? "show" : ""}`} onClick={close}/><aside className={`sidebar ${open ? "open" : ""}`}><nav>{ADMIN_MENU.map(item=><button key={item.id} className={page===item.id?"active":""} onClick={()=>{navigate(item.id);close()}}><i>{item.icon}</i><span>{item.label}</span></button>)}</nav><div className="help"><b>ศูนย์ช่วยเหลือ</b><span>คู่มือและแจ้งปัญหาการใช้งาน</span><button>ดูคู่มือระบบ</button></div></aside></>;
}

export default function AdminLayout({ page, navigate, title, onLogout, children }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  return <div className="app-shell"><Header onMenu={()=>setMobileMenu(true)} onLogout={onLogout}/><Sidebar page={page} navigate={navigate} open={mobileMenu} close={()=>setMobileMenu(false)}/><main className="content page-enter" aria-label={title}>{children}</main></div>;
}

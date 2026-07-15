import { useEffect, useMemo, useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { CasesPage, PetsPage, RegistrationsPage, ReportsPage, SettingsPage } from "./pages/Operations.jsx";
import { createApi, IS_GITHUB_DEMO } from "./lib/api.js";

const menu = [
  ["dashboard", "▦", "ภาพรวม"], ["registrations", "⌁", "คำขอขึ้นทะเบียน"],
  ["pets", "●", "ข้อมูลสัตว์"], ["services", "+", "วัคซีนและทำหมัน"],
  ["map", "⌖", "แผนที่"], ["cases", "!", "แจ้งเหตุ"],
  ["reports", "▤", "รายงาน"], ["settings", "⚙", "ตั้งค่าระบบ"],
];

const initialStats = { total: 0, dogs: 0, cats: 0, pending: 0, vaccinations: 0, sterilizations: 0, openCases: 0 };
const statusLabel = {
  SUBMITTED: ["รอตรวจสอบ", "amber"], UNDER_REVIEW: ["กำลังตรวจ", "blue"],
  NEED_MORE_INFO: ["ขอข้อมูลเพิ่ม", "rose"], APPROVED: ["อนุมัติแล้ว", "green"], REJECTED: ["ไม่อนุมัติ", "gray"],
};

function StatCard({ tone, icon, label, value, detail }) {
  return <article className={`stat ${tone}`}><div className="stat-icon">{icon}</div><div><p>{label}</p><strong>{Number(value || 0).toLocaleString("th-TH")}</strong><small>{detail}</small></div></article>;
}

function Header({ onMenu, onLogout }) {
  return <header className="topbar">
    <button className="menu-toggle" onClick={onMenu} aria-label="เปิดเมนู">☰</button>
    <div className="brand-mark">ทพ</div>
    <div className="brand"><strong>{ORGANIZATION.productName}</strong><span>{ORGANIZATION.shortName}</span></div>
    <div className="top-actions"><button className="round" aria-label="การแจ้งเตือน">♢<i>3</i></button><div className="profile"><b>จท</b><span><strong>เจ้าหน้าที่ระบบ</strong><small>ผู้ดูแลระบบ</small></span></div><button className="signout" onClick={onLogout}>ออกจากระบบ</button></div>
  </header>;
}

function Sidebar({ page, setPage, open, close, pending }) {
  return <><div className={`scrim ${open ? "show" : ""}`} onClick={close} />
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <nav>{menu.map(([id, icon, label]) => <button key={id} className={page === id ? "active" : ""} onClick={() => { setPage(id); close(); }}><i>{icon}</i><span>{label}</span>{id === "registrations" && Number(pending)>0 && <em>{pending}</em>}</button>)}</nav>
      <div className="help"><b>ศูนย์ช่วยเหลือ</b><span>คู่มือและแจ้งปัญหาการใช้งาน</span><button>ดูคู่มือระบบ</button></div>
    </aside></>;
}

function Dashboard({ stats, requests, villages, live }) {
  const total = Number(stats.total || 0);
  const vaccinationCoverage = total ? Math.round(Number(stats.vaccinations || 0) * 100 / total) : 0;
  const sterilizationCoverage = total ? Math.round(Number(stats.sterilizations || 0) * 100 / total) : 0;
  return <>
    <section className="welcome"><div><p className="eyebrow">ภาพรวมระบบ · 15 กรกฎาคม 2569</p><h1>สวัสดีครับ เจ้าหน้าที่</h1><p>ติดตามการขึ้นทะเบียนและงานบริการสัตว์ในพื้นที่เทศบาลท่าโพธ์</p></div><div className={`sync ${live ? "ok" : "demo"}`}><i />{live ? "เชื่อมต่อฐานข้อมูลแล้ว" : "โหมดข้อมูลตัวอย่าง"}</div></section>
    <section className="stats-grid">
      <StatCard tone="green" icon="●" label="สัตว์ขึ้นทะเบียน" value={stats.total} detail={`${stats.dogs || 0} สุนัข · ${stats.cats || 0} แมว`} />
      <StatCard tone="amber" icon="⌁" label="คำขอรอตรวจสอบ" value={stats.pending} detail="ควรตรวจภายใน 3 วันทำการ" />
      <StatCard tone="blue" icon="✚" label="รับวัคซีนปีนี้" value={stats.vaccinations} detail={`คิดเป็น ${vaccinationCoverage}% ของสัตว์ทั้งหมด`} />
      <StatCard tone="violet" icon="◇" label="ทำหมันแล้ว" value={stats.sterilizations} detail={`คิดเป็น ${sterilizationCoverage}% ของสัตว์ทั้งหมด`} />
    </section>
    <section className="main-grid">
      <article className="panel requests"><div className="panel-head"><div><h2>คำขอล่าสุด</h2><p>รายการจากประชาชนที่ต้องดำเนินการ</p></div><button className="text-btn">ดูทั้งหมด →</button></div><RequestTable requests={requests} /></article>
      <aside className="panel coverage"><div className="panel-head"><div><h2>ความครอบคลุมบริการ</h2><p>เป้าหมายประจำปี 2569</p></div></div>
        <Progress label="วัคซีนพิษสุนัขบ้า" value={vaccinationCoverage} color="green" /><Progress label="การทำหมัน" value={sterilizationCoverage} color="violet" />
        <div className="case-callout"><span>!</span><div><b>{stats.openCases || 0} เหตุที่กำลังดำเนินการ</b><small>ตรวจสอบรายละเอียดในเมนูแจ้งเหตุ</small></div><button>ตรวจสอบ</button></div>
      </aside>
    </section>
    <section className="village-panel panel"><div className="panel-head"><div><h2>ภาพรวมรายหมู่บ้าน</h2><p>ความครอบคลุมวัคซีนจากข้อมูลจริงในระบบ</p></div><select aria-label="เลือกช่วงเวลา"><option>ปีงบประมาณ 2569</option></select></div><VillageBars rows={villages} /></section>
  </>;
}

function RequestTable({ requests }) {
  return <div className="table-wrap"><table><thead><tr><th>เลขที่คำขอ</th><th>เจ้าของ / สัตว์</th><th>พื้นที่</th><th>สถานะ</th><th>วันที่ยื่น</th><th /></tr></thead><tbody>{requests.map(r => { const s = statusLabel[r.status] || [r.status, "gray"]; return <tr key={r.referenceNo}><td><b>{r.referenceNo}</b></td><td><div className="pet-cell"><i>{r.species === "DOG" ? "ส" : "ม"}</i><span><b>{r.petName}</b><small>{r.ownerName}</small></span></div></td><td>หมู่ {r.villageNo}</td><td><span className={`badge ${s[1]}`}>{s[0]}</span></td><td>{new Date(r.submittedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</td><td><button className="row-action" aria-label="ดูรายละเอียด">›</button></td></tr>; })}</tbody></table></div>;
}

function Progress({ label, value, color }) { return <div className="progress"><div><b>{label}</b><strong>{value}%</strong></div><span><i className={color} style={{ width: `${value}%` }} /></span></div>; }
function VillageBars({ rows=[] }) { const data = rows.length ? rows.map(r => ({ villageNo:r.villageNo, value:Number(r.totalPets) ? Math.round(Number(r.vaccinated)*100/Number(r.totalPets)) : 0 })) : Array.from({length:11},(_,i)=>({villageNo:i+1,value:0})); return <div className="villages">{data.map(item => <div key={item.villageNo}><span>หมู่ {item.villageNo}</span><i><b style={{ height: `${item.value}%` }} /></i><strong>{item.value}%</strong></div>)}</div>; }

function Login({ onLogin }) {
  const devMode = import.meta.env.DEV;
  const passwordOptional = devMode || IS_GITHUB_DEMO;
  const [email, setEmail] = useState("admin@thapho.go.th");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (IS_GITHUB_DEMO && password.length === 0) {
        sessionStorage.setItem("prms_access_token", "github-pages-demo");
        onLogin("github-pages-demo");
        return;
      }
      const usePasswordlessAccess = passwordOptional && password.length === 0;
      const data = await createApi(null).post(usePasswordlessAccess ? "/api/auth/dev-login" : "/api/auth/login", { email, password });
      sessionStorage.setItem("prms_access_token", data.token);
      onLogin(data.token);
    } catch (err) { setError(err.message || "ไม่สามารถเข้าสู่ระบบได้"); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-card"><div className="login-brand">ทพ</div><p className="eyebrow">{ORGANIZATION.productName}</p><h1>เข้าสู่ระบบเจ้าหน้าที่</h1><p>{ORGANIZATION.shortName}</p><form onSubmit={submit}><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>รหัสผ่าน {passwordOptional&&<span className="optional">ไม่ต้องกรอกในช่วงพัฒนา</span>}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" required={!passwordOptional} placeholder={passwordOptional?"เว้นว่างเพื่อเข้าสู่ระบบ":"กรอกรหัสผ่าน"}/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}</button></form><small>{passwordOptional?"เว็บไซต์สาธิตสำหรับตรวจสอบระบบก่อนเปิดใช้งานจริง":"ระบบสำหรับเจ้าหน้าที่ผู้ได้รับอนุญาตเท่านั้น"}</small></section></main>;
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [stats, setStats] = useState(initialStats);
  const [requests, setRequests] = useState([]);
  const [villages, setVillages] = useState([]);
  const [live, setLive] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem("prms_access_token"));
  const title = useMemo(() => menu.find(m => m[0] === page)?.[2], [page]);

  useEffect(() => {
    if (!token) return;
    const api = createApi(token);
    Promise.all([
      api.get("/api/admin/dashboard"), api.get("/api/admin/registrations"), api.get("/api/admin/reports/villages"),
    ]).then(([a, b, c]) => { setStats(a); setRequests(b); setVillages(c); setLive(true); }).catch(() => setLive(false));
  }, [token]);

  if (!token) return <Login onLogin={setToken} />;
  const logout = () => { sessionStorage.removeItem("prms_access_token"); setToken(null); };

  return <div className="app-shell"><Header onMenu={() => setMobileMenu(true)} onLogout={logout} /><Sidebar page={page} setPage={setPage} open={mobileMenu} close={() => setMobileMenu(false)} pending={stats.pending} />
    <main className="content" aria-label={title}>{page === "dashboard" ? <Dashboard stats={stats} requests={requests} villages={villages} live={live} /> : page === "registrations" ? <RegistrationsPage token={token} onChanged={()=>setLive(false)} /> : page === "pets" ? <PetsPage token={token} /> : page === "services" ? <PetsPage token={token} serviceMode /> : page === "cases" ? <CasesPage token={token} /> : page === "reports" ? <ReportsPage token={token} /> : page === "map" ? <ReportsPage token={token} mapOnly /> : <SettingsPage />}</main>
  </div>;
}

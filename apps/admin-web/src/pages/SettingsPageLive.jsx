import { useEffect, useMemo, useState } from "react";
import { LoadingPanel, Notice, PageHead } from "../components/common/PageUI.jsx";
import { createApi } from "../lib/api.js";
import "../admin-core.css";

const roleLabels = { ADMIN: "ผู้ดูแลระบบ", OFFICER: "เจ้าหน้าที่", VIEWER: "ผู้ตรวจสอบ" };

export default function SettingsPageLive({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [system, setSystem] = useState(null);
  const [users, setUsers] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setMessage("");
    const [systemResult, userResult, villageResult] = await Promise.allSettled([
      api.get("/api/admin/system-status"),
      api.get("/api/admin/users"),
      api.get("/api/public/villages"),
    ]);
    if (systemResult.status === "fulfilled") setSystem(systemResult.value);
    else setMessage(systemResult.reason?.message || "ไม่สามารถโหลดสถานะระบบได้");
    if (userResult.status === "fulfilled") setUsers(Array.isArray(userResult.value) ? userResult.value : []);
    if (villageResult.status === "fulfilled") setVillages(Array.isArray(villageResult.value) ? villageResult.value : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [api]);

  const updateUser = async (user, changes) => {
    setSavingId(user.id);
    setMessage("");
    try {
      const next = { role: user.role, isActive: Boolean(user.isActive), villageId: user.villageId || null, ...changes };
      await api.patch(`/api/admin/users/${user.id}`, next);
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, ...next } : item));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <LoadingPanel text="กำลังตรวจสอบองค์ประกอบระบบ…" />;

  return (
    <>
      <PageHead eyebrow="การตั้งค่าระบบ" title="ช่องทาง ความปลอดภัย และผู้ใช้งาน" detail="สถานะจริงจาก API และฐานข้อมูลกลาง" actions={<button type="button" className="refresh-btn" onClick={load}>↻ ตรวจสอบใหม่</button>} />
      <Notice message={message} />
      <section className="settings-grid core-system-grid">
        <article className="panel"><i className="setting-icon">API</i><div><b>Admin API</b><span>บริการกลางสำหรับทุกช่องทาง</span></div><em className={system?.api === "ready" ? "ready" : "waiting"}>{system?.api === "ready" ? "พร้อมใช้งาน" : "ตรวจสอบ"}</em></article>
        <article className="panel"><i className="setting-icon">DB</i><div><b>ฐานข้อมูลกลาง</b><span>{system?.databaseVersion ? `MariaDB/MySQL ${system.databaseVersion}` : "ไม่พบข้อมูลเวอร์ชัน"}</span></div><em className={system?.database === "ready" ? "ready" : "waiting"}>{system?.database === "ready" ? "เชื่อมต่อแล้ว" : "ไม่พร้อม"}</em></article>
        <article className="panel"><i className="setting-icon line">L</i><div><b>LINE OA / LIFF</b><span>ช่องทางหลักสำหรับเจ้าของสัตว์</span></div><em className={system?.line === "configured" ? "ready" : "waiting"}>{system?.line === "configured" ? "ตั้งค่าแล้ว" : "รอการตั้งค่า"}</em></article>
        <article className="panel"><i className="setting-icon">AL</i><div><b>Audit Log</b><span>{Number(system?.auditLogs?.total || 0).toLocaleString("th-TH")} เหตุการณ์</span></div><em className="ready">เปิดใช้งาน</em></article>
        <article className="panel"><i className="setting-icon line">N</i><div><b>คิวแจ้งเตือน LINE</b><span>ส่งแล้ว {Number(system?.notifications?.sent || 0).toLocaleString("th-TH")} · รอส่ง {Number(system?.notifications?.pending || 0).toLocaleString("th-TH")}</span></div><em className={Number(system?.notifications?.failed || 0) ? "waiting" : "ready"}>{Number(system?.notifications?.failed || 0) ? `ล้มเหลว ${Number(system.notifications.failed).toLocaleString("th-TH")}` : "ปกติ"}</em></article>
      </section>

      <article className="panel core-panel core-users-panel">
        <div className="panel-head"><div><h2>บัญชีเจ้าหน้าที่และบทบาท</h2><p>บัญชีทั้งหมด {Number(system?.users?.total || users.length).toLocaleString("th-TH")} · ใช้งาน {Number(system?.users?.active || 0).toLocaleString("th-TH")}</p></div></div>
        {users.length ? <div className="core-table-wrap"><table className="core-table"><thead><tr><th>เจ้าหน้าที่</th><th>บทบาท</th><th>พื้นที่รับผิดชอบ</th><th>สถานะ</th><th>เข้าสู่ระบบล่าสุด</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.fullName}</strong><small>{user.email}</small></td><td><select aria-label={`บทบาทของ ${user.fullName}`} value={user.role} disabled={savingId === user.id} onChange={(event) => updateUser(user, { role: event.target.value })}><option value="ADMIN">{roleLabels.ADMIN}</option><option value="OFFICER">{roleLabels.OFFICER}</option><option value="VIEWER">{roleLabels.VIEWER}</option></select></td><td><select aria-label={`พื้นที่ของ ${user.fullName}`} value={user.villageId || ""} disabled={savingId === user.id || user.role === "ADMIN"} onChange={(event) => updateUser(user, { villageId: event.target.value ? Number(event.target.value) : null })}><option value="">ทุกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>{village.name}</option>)}</select></td><td><button type="button" className={`core-toggle ${user.isActive ? "active" : ""}`} disabled={savingId === user.id} onClick={() => updateUser(user, { isActive: !user.isActive })}>{user.isActive ? "ใช้งานอยู่" : "ระงับแล้ว"}</button></td><td>{user.lastLoginAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(user.lastLoginAt)) : "ยังไม่เคยเข้าสู่ระบบ"}</td></tr>)}</tbody></table></div> : <div className="module-empty"><i>◇</i><b>บัญชีนี้ไม่มีสิทธิ์จัดการผู้ใช้</b><span>เฉพาะผู้ดูแลระบบเท่านั้นที่เห็นรายชื่อและแก้ไขบทบาทได้</span></div>}
      </article>
    </>
  );
}

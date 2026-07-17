import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingPanel, Notice, PageHead } from "../components/common/PageUI.jsx";
import { createApi } from "../lib/api.js";
import "../admin-core.css";

const actionLabels = {
  UPDATE_STATUS: "เปลี่ยนสถานะ",
  ADD_VACCINATION: "เพิ่มวัคซีน",
  RECORD_STERILIZATION: "บันทึกทำหมัน",
  UPDATE_OWNER: "แก้ไขเจ้าของ",
  UPDATE_STAFF_ACCESS: "แก้ไขสิทธิ์เจ้าหน้าที่",
};

export default function AuditPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [rows, setRows] = useState([]);
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const query = entityType ? `?entityType=${encodeURIComponent(entityType)}` : "";
      const data = await api.get(`/api/admin/audit-logs${query}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      setRows([]);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [api, entityType]);

  return (
    <>
      <PageHead eyebrow="การตรวจสอบย้อนหลัง" title="Audit Log" detail="ติดตามว่าใครทำอะไรกับข้อมูลใดและเมื่อใด" actions={<button type="button" className="refresh-btn" onClick={load} disabled={loading}>↻ อัปเดตข้อมูล</button>} />
      <Notice message={message} />
      <div className="core-toolbar core-toolbar--compact"><select aria-label="กรองประเภทข้อมูล" value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="">ทุกประเภทข้อมูล</option><option value="REGISTRATION">คำขอ</option><option value="OWNER">เจ้าของ</option><option value="PET">สัตว์</option><option value="CASE">แจ้งเหตุ</option><option value="USER">ผู้ใช้</option></select><span className="core-count">{rows.length.toLocaleString("th-TH")} เหตุการณ์ล่าสุด</span></div>
      {loading ? <LoadingPanel text="กำลังโหลดประวัติการใช้งาน…" /> : <article className="panel core-panel">{rows.length ? <div className="core-table-wrap"><table className="core-table"><thead><tr><th>วันเวลา</th><th>ผู้ดำเนินการ</th><th>การกระทำ</th><th>ประเภทข้อมูล</th><th>รหัสข้อมูล</th><th>IP</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td><td><strong>{row.actorName || "ระบบ"}</strong><small>{row.actorEmail || "—"}</small></td><td><span className="core-status info">{actionLabels[row.action] || row.action}</span></td><td>{row.entityType}</td><td><code>{row.entityId || "—"}</code></td><td>{row.ipAddress || "—"}</td></tr>)}</tbody></table></div> : <EmptyState text="ยังไม่มีประวัติการใช้งาน" detail="กิจกรรมที่เปลี่ยนข้อมูลสำคัญจะแสดงในส่วนนี้" />}</article>}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingPanel, Notice, PageHead } from "../components/common/PageUI.jsx";
import { createApi } from "../lib/api.js";
import "../admin-core.css";

const emptyForm = {
  fullName: "",
  phone: "",
  lineUserId: "",
  houseNo: "",
  villageId: "",
  addressDetail: "",
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
}

export default function OwnersPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [owners, setOwners] = useState([]);
  const [villages, setVillages] = useState([]);
  const [search, setSearch] = useState("");
  const [villageId, setVillageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (villageId) query.set("villageId", villageId);
      const data = await api.get(`/api/admin/owners?${query}`);
      setOwners(Array.isArray(data) ? data : []);
    } catch (error) {
      setOwners([]);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/api/public/villages")
      .then((data) => setVillages(Array.isArray(data) ? data : []))
      .catch(() => setVillages([]));
  }, [api]);

  useEffect(() => { load(); }, [api, villageId]);

  const openEditor = async (owner) => {
    setMessage("");
    try {
      const detail = await api.get(`/api/admin/owners/${owner.id}`);
      setEditing(detail);
      setForm({
        fullName: detail.fullName || "",
        phone: detail.phone || "",
        lineUserId: detail.lineUserId || "",
        houseNo: detail.houseNo || "",
        villageId: String(detail.villageId || ""),
        addressDetail: detail.addressDetail || "",
      });
    } catch (error) {
      setMessage(error.message);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api.patch(`/api/admin/owners/${editing.id}`, form);
      setEditing(null);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="ทะเบียนเจ้าของ" title="เจ้าของและครัวเรือน" detail="ค้นหา ตรวจสอบ และปรับปรุงข้อมูลเจ้าของสัตว์ตามสิทธิ์" />
      <Notice message={message} />
      <form className="core-toolbar" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label className="core-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ เบอร์โทร เลขบัตร หรือเลขที่บ้าน" /></label>
        <select aria-label="กรองหมู่บ้าน" value={villageId} onChange={(event) => setVillageId(event.target.value)}><option value="">ทุกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>{village.name}</option>)}</select>
        <button type="submit">ค้นหา</button>
      </form>

      {loading ? <LoadingPanel text="กำลังโหลดทะเบียนเจ้าของ…" /> : (
        <article className="panel core-panel">
          <div className="panel-head"><div><h2>รายชื่อเจ้าของสัตว์</h2><p>พบ {owners.length.toLocaleString("th-TH")} รายการ · ข้อมูลส่วนบุคคลในรายการถูกปิดบังบางส่วน</p></div></div>
          {owners.length ? <div className="core-table-wrap"><table className="core-table"><thead><tr><th>เจ้าของ</th><th>ติดต่อ</th><th>ที่อยู่</th><th>สัตว์</th><th>LINE/Consent</th><th>วันที่สร้าง</th><th></th></tr></thead><tbody>{owners.map((owner) => <tr key={owner.id}><td><strong>{owner.fullName}</strong><small>{owner.nationalId || "ไม่ระบุเลขบัตร"}</small></td><td>{owner.phone}</td><td>บ้านเลขที่ {owner.houseNo}<small>หมู่ {owner.villageNo} · {owner.villageName}</small></td><td><b>{Number(owner.petCount || 0).toLocaleString("th-TH")}</b> ตัว</td><td><span className={`core-status ${owner.linkedLine ? "ready" : "muted"}`}>{owner.linkedLine ? "เชื่อม LINE" : "ยังไม่เชื่อม"}</span><small>{owner.consentAt ? `ยินยอม ${formatDate(owner.consentAt)}` : "ยังไม่มีเวลายินยอม"}</small></td><td>{formatDate(owner.createdAt)}</td><td><button type="button" className="core-row-button" onClick={() => openEditor(owner)}>ดูและแก้ไข</button></td></tr>)}</tbody></table></div> : <EmptyState text="ไม่พบเจ้าของสัตว์" detail="ลองเปลี่ยนคำค้นหาหรือตัวกรองหมู่บ้าน" />}
        </article>
      )}

      {editing ? <div className="modal-backdrop" role="presentation"><form className="service-dialog core-dialog" onSubmit={save}><div className="dialog-head"><div><p className="eyebrow">แก้ไขทะเบียนเจ้าของ</p><h2>{editing.fullName}</h2></div><button type="button" aria-label="ปิด" onClick={() => setEditing(null)}>×</button></div><div className="core-form-grid"><label>ชื่อ–นามสกุล<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label><label>หมายเลขโทรศัพท์<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} inputMode="numeric" maxLength="10" required /></label><label>LINE User ID<input value={form.lineUserId} onChange={(event) => setForm({ ...form, lineUserId: event.target.value })} placeholder="ไม่บังคับ" /></label><label>เลขที่บ้าน<input value={form.houseNo} onChange={(event) => setForm({ ...form, houseNo: event.target.value })} required /></label><label>หมู่บ้าน<select value={form.villageId} onChange={(event) => setForm({ ...form, villageId: event.target.value })} required><option value="">เลือกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>{village.name}</option>)}</select></label><label className="full">รายละเอียดที่อยู่<input value={form.addressDetail} onChange={(event) => setForm({ ...form, addressDetail: event.target.value })} /></label></div><div className="dialog-actions"><button type="button" onClick={() => setEditing(null)}>ยกเลิก</button><button type="submit" className="approve" disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button></div></form></div> : null}
    </>
  );
}

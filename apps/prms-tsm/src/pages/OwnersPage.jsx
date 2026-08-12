import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingPanel, Notice, PageHead, Pagination } from "../components/common/PageUI.jsx";
import { createPrmsApplication } from "../composition-root/createPrmsApplication.js";
import "../admin-core.css";

const emptyForm = {
  fullName: "",
  nationalId: "",
  phone: "",
  houseNo: "",
  villageId: "",
  addressDetail: "",
  isActive: true,
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(value));
}

export default function OwnersPage({ token }) {
  const api = useMemo(() => createPrmsApplication(token), [token]);
  const [owners, setOwners] = useState([]);
  const [villages, setVillages] = useState([]);
  const [search, setSearch] = useState("");
  const [villageId, setVillageId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ page: 1, hasNext: false });

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (villageId) query.set("villageId", villageId);
      query.set("page", String(page)); query.set("pageSize", "50");
      const response = await api.getPage(`/api/admin/owners?${query}`);
      setOwners(Array.isArray(response?.data) ? response.data : []);
      setPageMeta(response?.meta || { page, hasNext: false });
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

  useEffect(() => { load(); }, [api, villageId, page]);

  const openEditor = async (owner) => {
    setMessage("");
    try {
      const detail = await api.get(`/api/admin/owners/${owner.id}`);
      setEditing(detail);
      setForm({
        fullName: detail.fullName || "",
        nationalId: "",
        phone: detail.phone || "",
        houseNo: detail.houseNo || "",
        villageId: String(detail.villageId || ""),
        addressDetail: detail.addressDetail || "",
        isActive: Boolean(detail.isActive),
      });
    } catch (error) {
      setMessage(error.message);
    }
  };

  const openCreator = () => {
    setMessage("");
    setEditing({ id: null, fullName: "เจ้าของสัตว์เลี้ยงรายใหม่", linkedLine: false });
    setForm({ ...emptyForm });
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      if (editing.id) {
        const { nationalId: _nationalId, ...payload } = form;
        await api.patch(`/api/admin/owners/${editing.id}`, payload);
      } else {
        const { isActive: _isActive, ...payload } = form;
        await api.post("/api/admin/owners", payload);
      }
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
      <PageHead eyebrow="ทะเบียนเจ้าของสัตว์เลี้ยง" title="เจ้าของสัตว์เลี้ยงและครัวเรือน" detail="ค้นหา เพิ่ม และปรับปรุงข้อมูลเจ้าของสัตว์เลี้ยงตามสิทธิ์" actions={<button type="button" className="prms-button prms-button--primary" onClick={openCreator}>+ เพิ่มเจ้าของสัตว์เลี้ยง</button>} />
      <Notice message={message} />
      <form className="core-toolbar" onSubmit={(event) => { event.preventDefault(); if (page === 1) load(); else setPage(1); }}>
        <label className="core-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ เบอร์โทร เลขบัตร หรือเลขที่บ้าน" /></label>
        <select aria-label="กรองหมู่บ้าน" value={villageId} onChange={(event) => { setVillageId(event.target.value); setPage(1); }}><option value="">ทุกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>{village.name}</option>)}</select>
        <button type="submit">ค้นหา</button>
      </form>

      {loading ? <LoadingPanel text="กำลังโหลดทะเบียนเจ้าของ…" /> : (
        <article className="panel core-panel">
          <div className="panel-head"><div><h2>รายชื่อเจ้าของสัตว์เลี้ยง</h2><p>พบ {owners.length.toLocaleString("th-TH")} รายการ · ข้อมูลส่วนบุคคลในรายการถูกปิดบังบางส่วน</p></div></div>
          {owners.length ? <><div className="core-table-wrap"><table className="core-table"><thead><tr><th>เจ้าของ</th><th>ติดต่อ</th><th>ที่อยู่</th><th>สัตว์เลี้ยง</th><th>LINE</th><th>สถานะทะเบียน</th><th></th></tr></thead><tbody>{owners.map((owner) => <tr key={owner.id} className={!owner.isActive ? "is-muted-row" : ""}><td><strong>{owner.fullName}</strong><small>{owner.nationalId || "ไม่ระบุเลขบัตร"}</small></td><td>{owner.phone}</td><td>บ้านเลขที่ {owner.houseNo}<small>หมู่ {owner.villageNo} · {owner.villageName}</small></td><td><b>{Number(owner.petCount || 0).toLocaleString("th-TH")}</b> ตัว</td><td><span className={`core-status ${owner.linkedLine ? "ready" : "muted"}`}>{owner.linkedLine ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</span><small>{owner.consentAt ? `ยินยอม ${formatDate(owner.consentAt)}` : "ยังไม่ยืนยันผ่าน LINE"}</small></td><td><span className={`core-status ${owner.isActive ? "ready" : "muted"}`}>{owner.isActive ? "ใช้งาน" : "ระงับ"}</span><small>สร้าง {formatDate(owner.createdAt)}</small></td><td><button type="button" className="core-row-button" onClick={() => openEditor(owner)}>ดูและแก้ไข</button></td></tr>)}</tbody></table></div><Pagination page={Number(pageMeta.page || page)} hasNext={Boolean(pageMeta.hasNext)} onChange={setPage} disabled={loading}/></> : <EmptyState text="ไม่พบเจ้าของสัตว์เลี้ยง" detail="ลองเปลี่ยนคำค้นหาหรือตัวกรองหมู่บ้าน" />}
        </article>
      )}

      {editing ? <div className="modal-backdrop" role="presentation"><form className="service-dialog core-dialog" onSubmit={save}><div className="dialog-head"><div><p className="eyebrow">{editing.id ? "แก้ไขทะเบียนเจ้าของ" : "เพิ่มทะเบียนเจ้าของ"}</p><h2>{editing.fullName}</h2></div><button type="button" aria-label="ปิด" onClick={() => setEditing(null)}>×</button></div><div className="core-form-grid"><label>ชื่อ–นามสกุล<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label>{!editing.id ? <label>เลขประจำตัวประชาชน (ถ้ามี)<input value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value.replace(/\D/g, "") })} inputMode="numeric" minLength="13" maxLength="13" /></label> : null}<label>หมายเลขโทรศัพท์<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, "") })} inputMode="numeric" minLength="10" maxLength="10" required /></label><label>เลขที่บ้าน<input value={form.houseNo} onChange={(event) => setForm({ ...form, houseNo: event.target.value })} required /></label><label>หมู่บ้าน<select value={form.villageId} onChange={(event) => setForm({ ...form, villageId: event.target.value })} required><option value="">เลือกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>{village.name}</option>)}</select></label>{editing.id ? <label>สถานะทะเบียน<select value={form.isActive ? "ACTIVE" : "INACTIVE"} onChange={(event) => setForm({ ...form, isActive: event.target.value === "ACTIVE" })}><option value="ACTIVE">ใช้งาน</option><option value="INACTIVE">ระงับการใช้งาน</option></select></label> : null}<label className="full">รายละเอียดที่อยู่<input value={form.addressDetail} onChange={(event) => setForm({ ...form, addressDetail: event.target.value })} /></label><p className="core-form-note full">การเชื่อมบัญชี LINE ต้องทำโดยเจ้าของสัตว์เลี้ยงผ่านขั้นตอนยืนยันตัวตนเท่านั้น เจ้าหน้าที่ไม่สามารถกรอก LINE User ID แทนได้</p></div><div className="dialog-actions"><button type="button" onClick={() => setEditing(null)}>ยกเลิก</button><button type="submit" className="approve" disabled={saving}>{saving ? "กำลังบันทึก…" : editing.id ? "บันทึกการแก้ไข" : "เพิ่มเจ้าของสัตว์เลี้ยง"}</button></div></form></div> : null}
    </>
  );
}

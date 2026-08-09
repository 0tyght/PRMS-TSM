import { useCallback, useEffect, useMemo, useState } from "react";
import { createApi } from "@smart-thapho/web-core/api";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatNumber } from "../components/ui.jsx";

const TABS = Object.freeze([
  ["vehicles", "รถเก็บขยะ"],
  ["drivers", "คนขับรถเก็บขยะ"],
  ["routes", "เส้นทางเก็บขยะ"],
]);

function ResourceForm({ type, initial, onCancel, onSubmit, saving }) {
  const editing = Boolean(initial?.id);

  function submit(event) {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(event.currentTarget).entries());

    if (type === "vehicles") {
      onSubmit({
        vehicleCode: value.vehicleCode,
        registrationNo: value.registrationNo,
        vehicleType: value.vehicleType,
        capacityKg: value.capacityKg ? Number(value.capacityKg) : null,
        status: value.status,
        note: value.note || null,
      });
    }

    if (type === "drivers") {
      onSubmit({
        fullName: value.fullName,
        phone: value.phone,
        lineUserId: value.lineUserId || null,
        isActive: value.isActive === "true",
      });
    }

    if (type === "routes") {
      onSubmit({
        routeCode: value.routeCode,
        routeName: value.routeName,
        description: value.description || null,
        isActive: value.isActive === "true",
      });
    }
  }

  return (
    <form className="waste-form" onSubmit={submit}>
      {type === "vehicles" && <>
        <label>รหัสรถ<input name="vehicleCode" required defaultValue={initial?.vehicleCode || ""} placeholder="เช่น W-01" /></label>
        <label>หมายเลขทะเบียนรถ<input name="registrationNo" required defaultValue={initial?.registrationNo || ""} /></label>
        <label>รายละเอียดรถ<input name="vehicleType" required defaultValue={initial?.vehicleType || ""} placeholder="เช่น รถบรรทุกอัดท้าย" /></label>
        <label>ความจุ (กิโลกรัม)<input name="capacityKg" type="number" min="1" defaultValue={initial?.capacityKg || ""} /></label>
        <label>สถานะ<select name="status" defaultValue={initial?.status || "AVAILABLE"}><option value="AVAILABLE">พร้อมใช้งาน</option><option value="IN_SERVICE">กำลังใช้งาน</option><option value="MAINTENANCE">ซ่อมบำรุง</option><option value="OUT_OF_SERVICE">หยุดใช้งาน</option></select></label>
        <label className="waste-form__wide">หมายเหตุ<textarea name="note" defaultValue={initial?.note || ""} rows="3" /></label>
      </>}
      {type === "drivers" && <>
        <label className="waste-form__wide">ชื่อ-นามสกุล<input name="fullName" required defaultValue={initial?.fullName || ""} /></label>
        <label>โทรศัพท์<input name="phone" inputMode="numeric" pattern="0[0-9]{9}" required defaultValue={initial?.phone || ""} /></label>
        <label>LINE User ID <small>เชื่อมจาก LINE ภายหลังได้</small><input name="lineUserId" defaultValue={initial?.lineUserId || ""} /></label>
        <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">ปฏิบัติงานได้</option><option value="false">ปิดการใช้งาน</option></select></label>
      </>}
      {type === "routes" && <>
        <label>รหัสเส้นทาง<input name="routeCode" required defaultValue={initial?.routeCode || ""} placeholder="เช่น R-01" /></label>
        <label>ชื่อเส้นทาง<input name="routeName" required defaultValue={initial?.routeName || ""} placeholder="เช่น เส้นทางหมู่ 1–3" /></label>
        <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">เปิดใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label>
        <label className="waste-form__wide">รายละเอียดเส้นทาง<textarea name="description" defaultValue={initial?.description || ""} rows="4" placeholder="ระบุพื้นที่ หมู่บ้าน หรือข้อสังเกตสำหรับการปฏิบัติงาน" /></label>
        <p className="waste-form__hint">พิกัดเส้นทางและจุดเก็บขยะจะเพิ่มจากแผนที่ เมื่อเชื่อมอุปกรณ์ GPS และทะเบียนผู้ใช้บริการ</p>
      </>}
      <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : editing ? "บันทึกการแก้ไข" : "บันทึกข้อมูล"}</button></footer>
    </form>
  );
}

function ResourceTable({ type, records, onEdit }) {
  if (type === "vehicles") {
    return <table className="waste-table"><thead><tr><th>รหัสรถ</th><th>ทะเบียน / รายละเอียด</th><th>ความจุ</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.vehicleCode}</strong></td><td><strong>{item.registrationNo}</strong><small>{item.vehicleType}</small></td><td>{item.capacityKg ? `${formatNumber(item.capacityKg)} กก.` : "-"}</td><td><StatusBadge value={item.status} /></td><td><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button></td></tr>)}</tbody></table>;
  }

  if (type === "drivers") {
    return <table className="waste-table"><thead><tr><th>คนขับรถเก็บขยะ</th><th>โทรศัพท์</th><th>การเชื่อม LINE</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong></td><td>{item.phone}</td><td>{item.lineUserId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</td><td><StatusBadge value={item.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button></td></tr>)}</tbody></table>;
  }

  return <table className="waste-table"><thead><tr><th>เส้นทาง</th><th>รายละเอียด</th><th>จุดเก็บ / ผู้ใช้บริการ</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.routeCode}</strong><small>{item.routeName}</small></td><td>{item.description || "-"}</td><td>{formatNumber(item.stopCount)} จุด / {formatNumber(item.serviceUserCount)} ราย</td><td><StatusBadge value={item.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button></td></tr>)}</tbody></table>;
}

export default function ResourcesPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [tab, setTab] = useState("vehicles");
  const [data, setData] = useState({ vehicles: [], drivers: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vehicles, drivers, routes] = await Promise.all([api.get("/api/waste/vehicles"), api.get("/api/waste/drivers"), api.get("/api/waste/routes")]);
      setData({ vehicles, drivers, routes });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const title = TABS.find(([id]) => id === tab)?.[1] || "ข้อมูลพื้นฐาน";
  const records = data[tab] || [];
  const createLabel = tab === "vehicles" ? "เพิ่มรถเก็บขยะ" : tab === "drivers" ? "เพิ่มคนขับรถเก็บขยะ" : "เพิ่มเส้นทางเก็บขยะ";

  async function save(value) {
    setSaving(true);
    setError("");
    try {
      const path = `/api/waste/${tab}${modal.item?.id ? `/${modal.item.id}` : ""}`;
      if (modal.item?.id) await api.patch(path, value);
      else await api.post(path, value);
      setModal(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHead eyebrow="MASTER DATA" title="ข้อมูลพื้นฐาน" detail="จัดการรถเก็บขยะ คนขับรถเก็บขยะ และเส้นทางที่ใช้วางแผนงาน" />
    <div className="waste-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{label}<b>{formatNumber(data[id]?.length)}</b></button>)}</div>
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-panel"><header className="waste-panel__head"><div><p>CONFIGURATION</p><h2>{title}</h2></div><button type="button" className="waste-button waste-button--primary" onClick={() => setModal({ type: tab, item: null })}>+ {createLabel}</button></header>{loading ? <LoadingState /> : !records.length ? <EmptyState title={`ยังไม่มี${title}`} detail="เพิ่มข้อมูลจริงเพื่อใช้สร้างแผนปฏิบัติงานและติดตามการเก็บขยะ" actionLabel={createLabel} onAction={() => setModal({ type: tab, item: null })} /> : <div className="waste-table-wrap"><ResourceTable type={tab} records={records} onEdit={(item) => setModal({ type: tab, item })} /></div>}</section>
    {modal ? <Modal title={modal.item ? `แก้ไข${modal.type === "vehicles" ? "รถเก็บขยะ" : modal.type === "drivers" ? "คนขับรถเก็บขยะ" : "เส้นทางเก็บขยะ"}` : createLabel} onClose={() => setModal(null)}><ResourceForm type={modal.type} initial={modal.item} onCancel={() => setModal(null)} onSubmit={save} saving={saving} /></Modal> : null}
  </>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import RouteOptimizationManager from "../components/RouteOptimizationManager.jsx";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatNumber } from "../components/ui.jsx";

const TABS = Object.freeze([
  ["vehicles", "รถเก็บขยะ"],
  ["drivers", "พนักงานประจำรถขยะ"],
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
        lineUserId: initial?.lineUserId || null,
        isActive: value.isActive === "true",
      });
    }

    if (type === "routes") {
      onSubmit({
        routeCode: value.routeCode,
        routeName: value.routeName,
        description: value.description || null,
        routeGeojson: initial?.routeGeojson || null,
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
        <label>สถานะ<select name="status" defaultValue={initial?.status || "AVAILABLE"}><option value="AVAILABLE">พร้อมใช้งาน</option><option value="IN_SERVICE">กำลังใช้งาน</option><option value="MAINTENANCE">ซ่อมบำรุง</option><option value="OUT_OF_SERVICE">ยกเลิกการใช้งาน</option></select></label>
        <label className="waste-form__wide">หมายเหตุ<textarea name="note" defaultValue={initial?.note || ""} rows="3" /></label>
      </>}
      {type === "drivers" && <>
        <label className="waste-form__wide">ชื่อ-นามสกุล<input name="fullName" required defaultValue={initial?.fullName || ""} /></label>
        <label>โทรศัพท์<input name="phone" inputMode="numeric" pattern="0[0-9]{9}" required defaultValue={initial?.phone || ""} /></label>
        {initial ? <div className="waste-form__summary"><strong>การเชื่อมบัญชี LINE</strong><p>{initial.lineUserId ? "เชื่อมบัญชีแล้ว หากต้องเปลี่ยนบัญชีให้สร้างรหัสเชื่อมใหม่จากตารางพนักงานประจำรถขยะ" : "ยังไม่เชื่อมบัญชี บันทึกข้อมูลก่อนแล้วสร้างรหัสเชื่อมจากตารางพนักงานประจำรถขยะ"}</p></div> : null}
        <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">ปฏิบัติงานได้</option><option value="false">ยกเลิกการใช้งาน</option></select></label>
      </>}
      {type === "routes" && <>
        <label>รหัสเส้นทาง<input name="routeCode" required defaultValue={initial?.routeCode || ""} placeholder="เช่น R-01" /></label>
        <label>ชื่อเส้นทาง<input name="routeName" required defaultValue={initial?.routeName || ""} placeholder="เช่น เส้นทางหมู่ 1–3" /></label>
        <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">ใช้งาน</option><option value="false">ยกเลิกการใช้งาน</option></select></label>
        <label className="waste-form__wide">รายละเอียดเส้นทาง<textarea name="description" defaultValue={initial?.description || ""} rows="4" placeholder="ระบุพื้นที่ หมู่บ้าน หรือข้อสังเกตสำหรับการปฏิบัติงาน" /></label>
        <p className="waste-form__hint">บันทึกข้อมูลเส้นทางก่อน จากนั้นกำหนดเส้นทางให้ผู้ใช้บริการ ระบบจะดึงพิกัดจุดเก็บมาจัดลำดับและคำนวณแนวเส้นตามถนนให้อัตโนมัติ</p>
      </>}
      <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : editing ? "บันทึกการแก้ไข" : "บันทึกข้อมูล"}</button></footer>
    </form>
  );
}

function ResourceTable({ type, records, onEdit, onDelete, onLink, onSchedule }) {
  if (type === "vehicles") {
    return <table className="waste-table"><thead><tr><th>รหัสรถ</th><th>ทะเบียน / รายละเอียด</th><th>ความจุ</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.vehicleCode}</strong></td><td><strong>{item.registrationNo}</strong><small>{item.vehicleType}</small></td><td>{item.capacityKg ? `${formatNumber(item.capacityKg)} กก.` : "-"}</td><td><StatusBadge value={item.status} /></td><td><div className="waste-table-actions"><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button><button type="button" className="waste-table-action waste-table-action--danger" onClick={() => onDelete(item)}>ลบ</button></div></td></tr>)}</tbody></table>;
  }

  if (type === "drivers") {
    return <table className="waste-table"><thead><tr><th>พนักงานประจำรถขยะ</th><th>โทรศัพท์</th><th>การเชื่อม LINE</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong></td><td>{item.phone}</td><td>{item.lineUserId ? <span className="waste-text-success">เชื่อมแล้ว</span> : <span className="waste-text-warning">ยังไม่เชื่อม</span>}</td><td><StatusBadge value={item.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><div className="waste-table-actions"><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button><button type="button" className="waste-table-action" onClick={() => onLink(item)}>{item.lineUserId ? "เชื่อมใหม่" : "สร้างรหัส LINE"}</button><button type="button" className="waste-table-action waste-table-action--danger" onClick={() => onDelete(item)}>ลบ</button></div></td></tr>)}</tbody></table>;
  }

  return <table className="waste-table"><thead><tr><th>เส้นทาง</th><th>รายละเอียด</th><th>จุดเก็บขยะ / ผู้ใช้บริการ</th><th>ความพร้อม</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => {
    const routeStatus = item.routeGeojson?.properties?.geometryStatus;
    const needsCalculation = !item.routeGeojson || routeStatus === "RECALCULATION_REQUIRED";
    return <tr key={item.id}><td><strong>{item.routeCode}</strong><small>{item.routeName}</small></td><td>{item.description || "-"}</td><td>{formatNumber(item.stopCount)} จุด / {formatNumber(item.serviceUserCount)} ราย{item.stopCount !== item.serviceUserCount ? <small className="waste-text-warning">จำนวนจุดเก็บยังไม่ตรงกับผู้ใช้บริการ</small> : null}</td><td>{needsCalculation ? <span className="waste-text-warning">ต้องคำนวณเส้นทาง</span> : <span className="waste-text-success">พร้อมใช้</span>}<small>{item.isActive ? "ใช้งาน" : "ยกเลิกการใช้งาน"}</small></td><td><div className="waste-table-actions"><button type="button" className="waste-table-action waste-table-action--primary" disabled={item.stopCount < 2 || !item.isActive} onClick={() => onSchedule({ type: "optimize", route: item })}>{needsCalculation ? "คำนวณเส้นทาง" : "ตรวจและคำนวณใหม่"}</button><button type="button" className="waste-table-action" onClick={() => onSchedule({ type: "schedule", route: item })}>ดูวันและพื้นที่เก็บ</button><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไขข้อมูลเส้นทาง</button><button type="button" className="waste-table-action waste-table-action--danger" onClick={() => onDelete(item)}>ลบ</button></div>{item.stopCount < 2 ? <small className="waste-text-warning">ต้องมีจุดเก็บอย่างน้อย 2 จุด</small> : null}</td></tr>;
  })}</tbody></table>;
}

function RouteSchedule({ route }) {
  const schedules = route.routeGeojson?.properties?.officialSchedules || [];
  return <section className="waste-official-schedule">
    <header><strong>{route.routeCode} · {route.routeName}</strong><span>ข้อมูลจากประกาศการเก็บและขนขยะ วันที่ 24 พฤศจิกายน 2566</span></header>
    {schedules.length ? <div>{schedules.map((schedule) => <article key={`${route.id}-${schedule.day}`}><div><b>{schedule.label}</b><time>{schedule.time} น.</time></div><ol>{schedule.areas.map((area) => <li key={area}>{area}</li>)}</ol></article>)}</div> : <EmptyState title="เส้นทางนี้ไม่มีตารางจากประกาศ" detail="สามารถกำหนดเส้นทางและวันปฏิบัติงานผ่านแผนปฏิบัติงานเก็บขยะ" />}
    <p>แนวเส้นบนแผนที่อ้างอิงถนน OpenStreetMap/OSRM เจ้าหน้าที่ควรตรวจถนนซอยและจุดกลับรถก่อนจัดแผนจริง</p>
  </section>;
}

export default function ResourcesPage({ token }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [tab, setTab] = useState("vehicles");
  const [data, setData] = useState({ vehicles: [], drivers: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [linkCode, setLinkCode] = useState(null);
  const [routeWorkspace, setRouteWorkspace] = useState(null);
  const [deleting, setDeleting] = useState(null);

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
  const createLabel = tab === "vehicles" ? "เพิ่มรถเก็บขยะ" : tab === "drivers" ? "เพิ่มพนักงานประจำรถขยะ" : "เพิ่มเส้นทางเก็บขยะ";

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

  async function createLineLinkCode(driver) {
    setSaving(true);
    setError("");
    try {
      const result = await api.post(`/api/waste/drivers/${driver.id}/line-link-code`);
      setLinkCode({ ...result, driver });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeResource() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    try {
      await api.delete(`/api/waste/${deleting.type}/${deleting.item.id}`);
      setDeleting(null);
      await load();
    } catch (requestError) {
      setDeleting(null);
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHead eyebrow="MASTER DATA" title="รถ พนักงานประจำรถขยะ และเส้นทางเก็บขยะ" detail="เพิ่ม แก้ไข ยกเลิกการใช้งาน และคำนวณเส้นทางจากจุดเก็บขยะจริงในหน้าจอเดียว" />
    <div className="waste-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{label}<b>{formatNumber(data[id]?.length)}</b></button>)}</div>
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-panel"><header className="waste-panel__head"><div><p>CONFIGURATION</p><h2>{title}</h2></div><button type="button" className="waste-button waste-button--primary" onClick={() => setModal({ type: tab, item: null })}>+ {createLabel}</button></header>{tab === "routes" ? <div className="waste-route-inline-guide"><b>1</b><span>เพิ่มชื่อรอบรับผิดชอบ</span><b>2</b><span>กำหนดสถานที่รับบริการจากหน้าทะเบียนผู้ใช้บริการเก็บขยะ</span><b>3</b><span>คำนวณ ตรวจบนแผนที่ และยืนยัน</span></div> : null}{loading ? <LoadingState /> : !records.length ? <EmptyState title={`ยังไม่มี${title}`} detail="เพิ่มข้อมูลจริงเพื่อใช้สร้างแผนปฏิบัติงานเก็บขยะและติดตามการเก็บขยะ" actionLabel={createLabel} onAction={() => setModal({ type: tab, item: null })} /> : <div className="waste-table-wrap"><ResourceTable type={tab} records={records} onEdit={(item) => setModal({ type: tab, item })} onDelete={(item) => setDeleting({ type: tab, item })} onLink={createLineLinkCode} onSchedule={setRouteWorkspace} /></div>}</section>
    {modal ? <Modal title={modal.item ? `แก้ไข${modal.type === "vehicles" ? "รถเก็บขยะ" : modal.type === "drivers" ? "พนักงานประจำรถขยะ" : "เส้นทางเก็บขยะ"}` : createLabel} onClose={() => setModal(null)}><ResourceForm type={modal.type} initial={modal.item} onCancel={() => setModal(null)} onSubmit={save} saving={saving} /></Modal> : null}
    {linkCode ? <Modal title="รหัสเชื่อมบัญชีพนักงานประจำรถขยะกับ LINE" onClose={() => setLinkCode(null)}><section className="waste-link-code"><p>ให้ <strong>{linkCode.driverName}</strong> เปิด LINE ของ Smart Tha Pho แล้วพิมพ์ข้อความนี้ภายใน 15 นาที</p><code>ยืนยันพนักงานประจำรถขยะ {linkCode.code}</code><small>รหัสใช้ได้ครั้งเดียว เมื่อสร้างรหัสใหม่ รหัสเดิมจะถูกยกเลิก</small><button type="button" className="waste-button waste-button--primary" onClick={() => navigator.clipboard?.writeText(`ยืนยันพนักงานประจำรถขยะ ${linkCode.code}`)}>คัดลอกข้อความ</button></section></Modal> : null}
    {routeWorkspace?.type === "schedule" ? <Modal title="วันและพื้นที่จัดเก็บตามประกาศ" onClose={() => setRouteWorkspace(null)}><RouteSchedule route={routeWorkspace.route} /></Modal> : null}
    {routeWorkspace?.type === "optimize" ? <Modal title="คำนวณเส้นทางจากจุดเก็บขยะ" onClose={() => setRouteWorkspace(null)}><RouteOptimizationManager api={api} route={routeWorkspace.route} onClose={() => setRouteWorkspace(null)} onSaved={load} /></Modal> : null}
    {deleting ? <Modal title="ยืนยันการลบข้อมูล" onClose={() => setDeleting(null)}><div className="waste-confirmation"><strong>{deleting.item.vehicleCode || deleting.item.fullName || `${deleting.item.routeCode} · ${deleting.item.routeName}`}</strong><p>ลบได้เฉพาะข้อมูลที่ยังไม่เคยถูกใช้ในแผนปฏิบัติงานเก็บขยะ หากมีประวัติ ระบบจะแนะนำให้ยกเลิกการใช้งานแทนเพื่อรักษาประวัติราชการ</p><footer><button type="button" className="waste-button waste-button--secondary" onClick={() => setDeleting(null)}>ยกเลิก</button><button type="button" className="waste-button waste-button--danger" disabled={saving} onClick={() => void removeResource()}>{saving ? "กำลังลบ" : "ยืนยันลบ"}</button></footer></div></Modal> : null}
  </>;
}

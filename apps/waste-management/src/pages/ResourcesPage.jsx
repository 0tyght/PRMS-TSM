import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatNumber } from "../components/ui.jsx";
import RouteEditor from "../components/RouteEditor.jsx";

const TABS = Object.freeze([
  ["vehicles", "รถเก็บขยะ"],
  ["drivers", "คนขับรถเก็บขยะ"],
  ["routes", "เส้นทางเก็บขยะ"],
]);

function ResourceForm({ type, initial, onCancel, onSubmit, onResolveRoute, saving }) {
  const editing = Boolean(initial?.id);
  const [routeGeojson, setRouteGeojson] = useState(() => initial?.routeGeojson || null);

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
        routeGeojson,
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
        {initial ? <div className="waste-form__summary"><strong>การเชื่อมบัญชี LINE</strong><p>{initial.lineUserId ? "เชื่อมบัญชีแล้ว หากต้องเปลี่ยนบัญชีให้สร้างรหัสเชื่อมใหม่จากตารางคนขับ" : "ยังไม่เชื่อมบัญชี บันทึกข้อมูลก่อนแล้วสร้างรหัสเชื่อมจากตารางคนขับ"}</p></div> : null}
        <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">ปฏิบัติงานได้</option><option value="false">ปิดการใช้งาน</option></select></label>
      </>}
      {type === "routes" && <>
        <label>รหัสเส้นทาง<input name="routeCode" required defaultValue={initial?.routeCode || ""} placeholder="เช่น R-01" /></label>
        <label>ชื่อเส้นทาง<input name="routeName" required defaultValue={initial?.routeName || ""} placeholder="เช่น เส้นทางหมู่ 1–3" /></label>
        <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">เปิดใช้งาน</option><option value="false">ปิดใช้งาน</option></select></label>
        <label className="waste-form__wide">รายละเอียดเส้นทาง<textarea name="description" defaultValue={initial?.description || ""} rows="4" placeholder="ระบุพื้นที่ หมู่บ้าน หรือข้อสังเกตสำหรับการปฏิบัติงาน" /></label>
        <div className="waste-form__wide"><RouteEditor value={routeGeojson} onChange={setRouteGeojson} onResolve={onResolveRoute} /></div>
        <p className="waste-form__hint">เส้นทางจะแสดงบนหน้า Overview ทันทีหลังบันทึก ส่วนจุดเก็บขยะจะผูกกับทะเบียนผู้ใช้บริการในขั้นตอนถัดไป</p>
      </>}
      <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : editing ? "บันทึกการแก้ไข" : "บันทึกข้อมูล"}</button></footer>
    </form>
  );
}

function ResourceTable({ type, records, onEdit, onDelete, onLink, onStops, onSchedule }) {
  if (type === "vehicles") {
    return <table className="waste-table"><thead><tr><th>รหัสรถ</th><th>ทะเบียน / รายละเอียด</th><th>ความจุ</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.vehicleCode}</strong></td><td><strong>{item.registrationNo}</strong><small>{item.vehicleType}</small></td><td>{item.capacityKg ? `${formatNumber(item.capacityKg)} กก.` : "-"}</td><td><StatusBadge value={item.status} /></td><td><div className="waste-table-actions"><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button><button type="button" className="waste-table-action waste-table-action--danger" onClick={() => onDelete(item)}>ลบ</button></div></td></tr>)}</tbody></table>;
  }

  if (type === "drivers") {
    return <table className="waste-table"><thead><tr><th>คนขับรถเก็บขยะ</th><th>โทรศัพท์</th><th>การเชื่อม LINE</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong></td><td>{item.phone}</td><td>{item.lineUserId ? <span className="waste-text-success">เชื่อมแล้ว</span> : <span className="waste-text-warning">ยังไม่เชื่อม</span>}</td><td><StatusBadge value={item.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><div className="waste-table-actions"><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไข</button><button type="button" className="waste-table-action" onClick={() => onLink(item)}>{item.lineUserId ? "เชื่อมใหม่" : "สร้างรหัส LINE"}</button><button type="button" className="waste-table-action waste-table-action--danger" onClick={() => onDelete(item)}>ลบ</button></div></td></tr>)}</tbody></table>;
  }

  return <table className="waste-table"><thead><tr><th>เส้นทาง</th><th>รายละเอียด</th><th>จุดเก็บ / ผู้ใช้บริการ</th><th>สถานะ</th><th aria-label="การจัดการ" /></tr></thead><tbody>{records.map((item) => <tr key={item.id}><td><strong>{item.routeCode}</strong><small>{item.routeName}</small></td><td>{item.description || "-"}</td><td>{formatNumber(item.stopCount)} จุด / {formatNumber(item.serviceUserCount)} ราย{item.stopCount !== item.serviceUserCount ? <small className="waste-text-warning">จำนวนจุดเก็บยังไม่ตรงกับผู้ใช้บริการ</small> : null}</td><td><StatusBadge value={item.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><div className="waste-table-actions"><button type="button" className="waste-table-action" onClick={() => onSchedule(item)}>ดูวันและพื้นที่เก็บ</button><button type="button" className="waste-table-action" onClick={() => onEdit(item)}>แก้ไขแผนที่</button><button type="button" className="waste-table-action" onClick={() => onStops(item)}>จัดลำดับจุดเก็บ</button><button type="button" className="waste-table-action waste-table-action--danger" onClick={() => onDelete(item)}>ลบ</button></div></td></tr>)}</tbody></table>;
}

function RouteSchedule({ route }) {
  const schedules = route.routeGeojson?.properties?.officialSchedules || [];
  return <section className="waste-official-schedule">
    <header><strong>{route.routeCode} · {route.routeName}</strong><span>ข้อมูลจากประกาศการเก็บและขนขยะ วันที่ 24 พฤศจิกายน 2566</span></header>
    {schedules.length ? <div>{schedules.map((schedule) => <article key={`${route.id}-${schedule.day}`}><div><b>{schedule.label}</b><time>{schedule.time} น.</time></div><ol>{schedule.areas.map((area) => <li key={area}>{area}</li>)}</ol></article>)}</div> : <EmptyState title="เส้นทางนี้ไม่มีตารางจากประกาศ" detail="สามารถกำหนดเส้นทางและวันปฏิบัติงานผ่านแผนงานประจำวัน" />}
    <p>แนวเส้นบนแผนที่อ้างอิงถนน OpenStreetMap/OSRM เจ้าหน้าที่ควรตรวจถนนซอยและจุดกลับรถก่อนจัดแผนจริง</p>
  </section>;
}

function RouteStopsManager({ api, route, onClose, onSaved }) {
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get(`/api/waste/routes/${route.id}/stops`).then((nextStops) => {
      if (active) setStops(nextStops);
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api, route.id]);

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    setStops((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.put(`/api/waste/routes/${route.id}/stops`, {
        stops: stops.map((stop, index) => ({ serviceUserId: stop.serviceUserId, sequenceNo: index + 1 })),
      });
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <p className="waste-modal-intro">จัดลำดับบ้านหรือสถานที่ตามลำดับที่รถควรเข้ารับบริการในเส้นทาง <strong>{route.routeName}</strong></p>
    <ErrorNotice error={error} />
    {loading ? <LoadingState label="กำลังโหลดจุดเก็บขยะ" /> : !stops.length ? <EmptyState title="เส้นทางนี้ยังไม่มีจุดเก็บ" detail="ไปที่ทะเบียนผู้ใช้บริการ แล้วกำหนดเส้นทางและตำแหน่งให้แต่ละรายก่อน" /> : <ol className="waste-stop-order-list">{stops.map((stop, index) => <li key={stop.id}><b>{index + 1}</b><div><strong>{stop.stopName}</strong><small>{stop.serviceNo} · หมู่ {stop.villageNo}{stop.latitude == null ? " · ยังไม่มีพิกัด" : ""}</small></div><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`เลื่อน ${stop.stopName} ขึ้น`}>↑</button><button type="button" disabled={index === stops.length - 1} onClick={() => move(index, 1)} aria-label={`เลื่อน ${stop.stopName} ลง`}>↓</button></div></li>)}</ol>}
    <footer className="waste-modal-actions"><button type="button" className="waste-button waste-button--secondary" onClick={onClose}>ยกเลิก</button><button type="button" className="waste-button waste-button--primary" disabled={loading || saving || !stops.length} onClick={save}>{saving ? "กำลังบันทึก" : "บันทึกลำดับจุดเก็บ"}</button></footer>
  </>;
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
  const [stopsRoute, setStopsRoute] = useState(null);
  const [scheduleRoute, setScheduleRoute] = useState(null);
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

  const resolveRoute = useCallback((waypoints) => api.post("/api/waste/routes/preview", { waypoints }), [api]);

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
    <PageHead eyebrow="MASTER DATA" title="ข้อมูลพื้นฐาน" detail="จัดการรถเก็บขยะ คนขับรถเก็บขยะ และเส้นทางที่ใช้วางแผนงาน" />
    <div className="waste-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{label}<b>{formatNumber(data[id]?.length)}</b></button>)}</div>
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-panel"><header className="waste-panel__head"><div><p>CONFIGURATION</p><h2>{title}</h2></div><button type="button" className="waste-button waste-button--primary" onClick={() => setModal({ type: tab, item: null })}>+ {createLabel}</button></header>{loading ? <LoadingState /> : !records.length ? <EmptyState title={`ยังไม่มี${title}`} detail="เพิ่มข้อมูลจริงเพื่อใช้สร้างแผนปฏิบัติงานและติดตามการเก็บขยะ" actionLabel={createLabel} onAction={() => setModal({ type: tab, item: null })} /> : <div className="waste-table-wrap"><ResourceTable type={tab} records={records} onEdit={(item) => setModal({ type: tab, item })} onDelete={(item) => setDeleting({ type: tab, item })} onLink={createLineLinkCode} onStops={setStopsRoute} onSchedule={setScheduleRoute} /></div>}</section>
    {modal ? <Modal title={modal.item ? `แก้ไข${modal.type === "vehicles" ? "รถเก็บขยะ" : modal.type === "drivers" ? "คนขับรถเก็บขยะ" : "เส้นทางเก็บขยะ"}` : createLabel} onClose={() => setModal(null)}><ResourceForm type={modal.type} initial={modal.item} onCancel={() => setModal(null)} onSubmit={save} onResolveRoute={resolveRoute} saving={saving} /></Modal> : null}
    {linkCode ? <Modal title="รหัสเชื่อมบัญชีคนขับกับ LINE" onClose={() => setLinkCode(null)}><section className="waste-link-code"><p>ให้ <strong>{linkCode.driverName}</strong> เปิด LINE ของ Smart Tha Pho แล้วพิมพ์ข้อความนี้ภายใน 15 นาที</p><code>ยืนยันคนขับ {linkCode.code}</code><small>รหัสใช้ได้ครั้งเดียว เมื่อสร้างรหัสใหม่ รหัสเดิมจะถูกยกเลิก</small><button type="button" className="waste-button waste-button--primary" onClick={() => navigator.clipboard?.writeText(`ยืนยันคนขับ ${linkCode.code}`)}>คัดลอกข้อความ</button></section></Modal> : null}
    {stopsRoute ? <Modal title="จัดลำดับจุดเก็บขยะ" onClose={() => setStopsRoute(null)}><RouteStopsManager api={api} route={stopsRoute} onClose={() => setStopsRoute(null)} onSaved={load} /></Modal> : null}
    {scheduleRoute ? <Modal title="วันและพื้นที่จัดเก็บตามประกาศ" onClose={() => setScheduleRoute(null)}><RouteSchedule route={scheduleRoute} /></Modal> : null}
    {deleting ? <Modal title="ยืนยันการลบข้อมูล" onClose={() => setDeleting(null)}><div className="waste-confirmation"><strong>{deleting.item.vehicleCode || deleting.item.fullName || `${deleting.item.routeCode} · ${deleting.item.routeName}`}</strong><p>ลบได้เฉพาะข้อมูลที่ยังไม่เคยถูกใช้ในแผนงาน หากมีประวัติ ระบบจะแนะนำให้ปิดการใช้งานแทนเพื่อรักษาประวัติราชการ</p><footer><button type="button" className="waste-button waste-button--secondary" onClick={() => setDeleting(null)}>ยกเลิก</button><button type="button" className="waste-button waste-button--danger" disabled={saving} onClick={() => void removeResource()}>{saving ? "กำลังลบ" : "ยืนยันลบ"}</button></footer></div></Modal> : null}
  </>;
}

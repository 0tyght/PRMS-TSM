import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatDate, toDateInput } from "../components/ui.jsx";

const INCIDENT_TYPES = Object.freeze({ VEHICLE_BREAKDOWN: "รถขัดข้อง", ACCIDENT: "อุบัติเหตุ", ROAD_CLOSED: "ถนนปิด", ACCESS_BLOCKED: "เข้าถึงจุดเก็บไม่ได้", OTHER: "อื่น ๆ" });

function IncidentForm({ plans, vehicles, drivers, onCancel, onSubmit, saving }) {
  const now = new Date(); const defaultTime = `${toDateInput(now)}T${now.toTimeString().slice(0, 5)}`;
  const submit = (event) => { event.preventDefault(); const value = Object.fromEntries(new FormData(event.currentTarget).entries()); onSubmit({ planId: value.planId || null, vehicleId: value.vehicleId || null, driverId: value.driverId || null, incidentType: value.incidentType, description: value.description, happenedAt: new Date(value.happenedAt).toISOString() }); };
  return <form className="waste-form" onSubmit={submit}><label>แผนปฏิบัติงานเก็บขยะ<select name="planId" defaultValue=""><option value="">ไม่ระบุ</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.planNo} — {plan.routeName}</option>)}</select></label><label>รถเก็บขยะ<select name="vehicleId" defaultValue=""><option value="">ไม่ระบุ</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleCode} — {vehicle.registrationNo}</option>)}</select></label><label>พนักงานประจำรถขยะ<select name="driverId" defaultValue=""><option value="">ไม่ระบุ</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select></label><label>ประเภทเหตุ<select name="incidentType" defaultValue="VEHICLE_BREAKDOWN">{Object.entries(INCIDENT_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>เวลาที่เกิดเหตุ<input name="happenedAt" type="datetime-local" defaultValue={defaultTime} required /></label><label className="waste-form__wide">รายละเอียดเหตุ<textarea name="description" rows="5" required minLength="4" placeholder="อธิบายผลกระทบต่อแผนปฏิบัติงานเก็บขยะและข้อมูลที่จำเป็นสำหรับเจ้าหน้าที่" /></label><footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : "บันทึกการแจ้งเหตุ"}</button></footer></form>;
}

function ReviewForm({ incident, vehicles, drivers, onCancel, onSubmit, saving }) {
  const submit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = Object.fromEntries(new FormData(form).entries());
    onSubmit({
      status: value.status,
      replacementVehicleId: value.replacementVehicleId || null,
      replacementDriverId: value.replacementDriverId || null,
      resumePlan: form.elements.resumePlan.checked,
      resolutionNote: value.resolutionNote || null,
    });
  };

  const availableVehicles = vehicles.filter((vehicle) => vehicle.status === "AVAILABLE" || vehicle.id === incident.vehicleId);
  const activeDrivers = drivers.filter((driver) => Number(driver.isActive) === 1 || driver.isActive === true || driver.id === incident.driverId);

  return <form className="waste-form" onSubmit={submit}>
    <div className="waste-form__summary">
      <strong>{INCIDENT_TYPES[incident.incidentType]}</strong>
      <p>{incident.description}</p>
      <small>ตรวจสอบทรัพยากรที่พร้อมใช้งานก่อนมอบหมาย ระบบจะไม่ยอมให้เลือกทรัพยากรที่กำลังอยู่ในแผนปฏิบัติงานเก็บขยะอื่น</small>
    </div>
    <label>สถานะเหตุ<select name="status" defaultValue={incident.status === "REPORTED" ? "ACKNOWLEDGED" : incident.status}><option value="ACKNOWLEDGED">รับทราบแล้ว / กำลังดำเนินการ</option><option value="RESOLVED">ปิดเหตุแล้ว</option></select></label>
    <label>รถเก็บขยะทดแทน<select name="replacementVehicleId" defaultValue={incident.replacementVehicleId || ""}><option value="">ใช้รถเดิม / ยังไม่ต้องเปลี่ยน</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicleCode} — {vehicle.registrationNo}</option>)}</select></label>
    <label>พนักงานประจำรถขยะทดแทน<select name="replacementDriverId" defaultValue={incident.replacementDriverId || ""}><option value="">ใช้พนักงานเดิม / ยังไม่ต้องเปลี่ยน</option>{activeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}{driver.driverCode ? ` (${driver.driverCode})` : ""}</option>)}</select></label>
    <label className="waste-form__wide waste-form__check"><input name="resumePlan" type="checkbox" defaultChecked /><span><strong>ให้แผนปฏิบัติงานเก็บขยะดำเนินต่อทันที</strong><small>เมื่อกำหนดรถหรือพนักงานทดแทน ระบบจะเปลี่ยนแผนกลับเป็น “กำลังปฏิบัติงาน” และแจ้งสถานะให้ผู้ใช้บริการในเส้นทาง</small></span></label>
    <label className="waste-form__wide">ผลการตรวจสอบ / การแก้ไข<textarea name="resolutionNote" rows="4" defaultValue={incident.resolutionNote || ""} placeholder="ระบุผลการตรวจสอบ ผู้ประสานงาน และวิธีแก้ไข" /></label>
    <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : "บันทึกการดำเนินการ"}</button></footer>
  </form>;
}

export default function IncidentsPage({ token }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [incidents, setIncidents] = useState([]); const [resources, setResources] = useState({ plans: [], vehicles: [], drivers: [] }); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [modal, setModal] = useState(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [nextIncidents, plans, vehicles, drivers] = await Promise.all([api.get("/api/waste/incidents"), api.get("/api/waste/plans"), api.get("/api/waste/vehicles"), api.get("/api/waste/drivers")]); setIncidents(nextIncidents); setResources({ plans, vehicles, drivers }); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const create = async (input) => { setSaving(true); setError(""); try { await api.post("/api/waste/incidents", input); setModal(null); await load(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } };
  const resolve = async (input) => { setSaving(true); setError(""); try { const hasReplacement = Boolean(input.replacementVehicleId || input.replacementDriverId); if (hasReplacement) { await api.post(`/api/waste/incidents/${modal.id}/replacement`, { replacementVehicleId: input.replacementVehicleId, replacementDriverId: input.replacementDriverId, resumePlan: input.resumePlan, resolutionNote: input.resolutionNote }); if (input.status === "RESOLVED") await api.patch(`/api/waste/incidents/${modal.id}`, { status: "RESOLVED", replacementVehicleId: input.replacementVehicleId, resolutionNote: input.resolutionNote }); } else { await api.patch(`/api/waste/incidents/${modal.id}`, { status: input.status, replacementVehicleId: null, resolutionNote: input.resolutionNote }); } setModal(null); await load(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } };
  return <>
    <PageHead eyebrow="INCIDENT MANAGEMENT" title="เหตุระหว่างการปฏิบัติงานเก็บขยะ" detail="รับแจ้งเหตุ ตรวจสอบ และประสานรถเก็บขยะทดแทนเมื่อแผนปฏิบัติงานเก็บขยะหยุดชะงัก" actions={<button type="button" className="waste-button waste-button--primary" onClick={() => setModal({ type: "create" })}>+ บันทึกเหตุ</button>} />
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-panel">{loading ? <LoadingState /> : !incidents.length ? <EmptyState title="ยังไม่มีเหตุระหว่างการปฏิบัติงานเก็บขยะ" detail="การแจ้งเหตุจากพนักงานประจำรถขยะผ่าน LINE และการบันทึกของเจ้าหน้าที่จะแสดงรวมกันที่นี่" actionLabel="บันทึกเหตุ" onAction={() => setModal({ type: "create" })} /> : <div className="waste-incident-board">{incidents.map((incident) => <article key={incident.id} className={`waste-incident-card is-${String(incident.status).toLowerCase()}`}><header><span>!</span><div><small>{INCIDENT_TYPES[incident.incidentType]}</small><h2>{incident.vehicleCode || incident.planNo || "เหตุที่ต้องดำเนินการ"}</h2></div><StatusBadge value={incident.status} /></header><p>{incident.description}</p><dl><div><dt>เกิดเหตุ</dt><dd>{formatDate(incident.happenedAt, { dateStyle: "medium", timeStyle: "short" })}</dd></div><div><dt>พนักงานเดิม</dt><dd>{incident.driverName || "ไม่ระบุ"}</dd></div><div><dt>รถทดแทน</dt><dd>{incident.replacementVehicleCode || "ยังไม่กำหนด"}</dd></div><div><dt>พนักงานทดแทน</dt><dd>{incident.replacementDriverName || "ยังไม่กำหนด"}</dd></div></dl>{incident.status !== "RESOLVED" ? <footer><button type="button" className="waste-button waste-button--secondary" onClick={() => setModal({ type: "resolve", ...incident })}>{incident.status === "REPORTED" ? "ตรวจสอบและมอบหมายทดแทน" : "อัปเดตผลการแก้ไข"}</button></footer> : null}</article>)}</div>}</section>
    {modal?.type === "create" ? <Modal title="บันทึกเหตุระหว่างการปฏิบัติงานเก็บขยะ" onClose={() => setModal(null)}><IncidentForm {...resources} onCancel={() => setModal(null)} onSubmit={create} saving={saving} /></Modal> : null}
    {modal?.type === "resolve" ? <Modal title="ตรวจสอบเหตุและมอบหมายทรัพยากรทดแทน" onClose={() => setModal(null)}><ReviewForm incident={modal} vehicles={resources.vehicles} drivers={resources.drivers} onCancel={() => setModal(null)} onSubmit={resolve} saving={saving} /></Modal> : null}
  </>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatDate, formatNumber, toDateInput } from "../components/ui.jsx";

function toIso(date, time) { return time ? new Date(`${date}T${time}:00+07:00`).toISOString() : null; }
function toTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(date);
}

const STATUS_CONFIRMATIONS = Object.freeze({
  IN_PROGRESS: { title: "ยืนยันเริ่มปฏิบัติงาน", detail: "รถและคนขับจะเปลี่ยนเป็นกำลังปฏิบัติงาน และเริ่มรับตำแหน่ง GPS ของแผนนี้", action: "เริ่มปฏิบัติงาน" },
  COMPLETED: { title: "ยืนยันปิดแผนงาน", detail: "ควรตรวจว่าจุดเก็บและเหตุระหว่างปฏิบัติงานถูกบันทึกครบแล้ว การปิดแผนไม่สามารถย้อนกลับได้", action: "ยืนยันเสร็จสิ้น" },
  CANCELLED: { title: "ยืนยันยกเลิกแผนงาน", detail: "แผนที่ยกเลิกแล้วไม่สามารถนำกลับมาเริ่มงานได้ หากยังต้องปฏิบัติงานให้สร้างแผนใหม่", action: "ยกเลิกแผนงาน" },
});

function PlanForm({ resources, date, initial = null, onCancel, onSubmit, saving }) {
  const [scheduledDate, setScheduledDate] = useState(initial?.scheduledDate?.slice?.(0, 10) || date);
  const submit = (event) => {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSubmit({
      planNo: value.planNo,
      scheduledDate,
      routeId: value.routeId,
      vehicleId: value.vehicleId,
      driverId: value.driverId,
      scheduledStartAt: toIso(scheduledDate, value.scheduledStartAt),
      scheduledEndAt: toIso(scheduledDate, value.scheduledEndAt),
      note: value.note || null,
    });
  };
  const defaultPlanNo = initial?.planNo || `WST-${scheduledDate.replaceAll("-", "")}-001`;

  return <form className="waste-form" onSubmit={submit}>
    <label>เลขที่แผนปฏิบัติงาน<input name="planNo" required defaultValue={defaultPlanNo} /></label>
    <label>วันที่ปฏิบัติงาน<input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} required /></label>
    <label>เส้นทางเก็บขยะ<select name="routeId" required defaultValue={initial?.routeId || ""}><option value="" disabled>เลือกเส้นทาง</option>{resources.routes.filter((item) => item.isActive || item.id === initial?.routeId).map((item) => <option value={item.id} key={item.id}>{item.routeCode} — {item.routeName} ({formatNumber(item.stopCount)} จุด)</option>)}</select></label>
    <label>รถเก็บขยะ<select name="vehicleId" required defaultValue={initial?.vehicleId || ""}><option value="" disabled>เลือกรถเก็บขยะ</option>{resources.vehicles.filter((item) => !["MAINTENANCE", "OUT_OF_SERVICE"].includes(item.status) || item.id === initial?.vehicleId).map((item) => <option value={item.id} key={item.id}>{item.vehicleCode} — {item.registrationNo}{item.status === "IN_SERVICE" ? " (กำลังใช้งาน)" : ""}</option>)}</select><small>ระบบจะป้องกันรถหรือคนขับที่มีแผนงานเวลาเดียวกัน</small></label>
    <label>คนขับรถเก็บขยะ<select name="driverId" required defaultValue={initial?.driverId || ""}><option value="" disabled>เลือกคนขับรถเก็บขยะ</option>{resources.drivers.filter((item) => item.isActive || item.id === initial?.driverId).map((item) => <option value={item.id} key={item.id}>{item.fullName}</option>)}</select></label>
    <label>เวลาเริ่มตามแผน<input name="scheduledStartAt" type="time" defaultValue={toTimeInput(initial?.scheduledStartAt)} /></label>
    <label>เวลาสิ้นสุดตามแผน<input name="scheduledEndAt" type="time" defaultValue={toTimeInput(initial?.scheduledEndAt)} /></label>
    <label className="waste-form__wide">หมายเหตุ<textarea name="note" rows="3" defaultValue={initial?.note || ""} placeholder="ข้อสั่งการหรือรายละเอียดงาน" /></label>
    <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : initial ? "บันทึกการแก้ไข" : "สร้างแผนปฏิบัติงาน"}</button></footer>
  </form>;
}

export default function PlansPage({ token, navigate }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [date, setDate] = useState(toDateInput());
  const [plans, setPlans] = useState([]);
  const [resources, setResources] = useState({ vehicles: [], drivers: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusConfirmation, setStatusConfirmation] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextPlans, vehicles, drivers, routes] = await Promise.all([
        api.get(`/api/waste/plans?date=${date}`),
        api.get("/api/waste/vehicles"),
        api.get("/api/waste/drivers"),
        api.get("/api/waste/routes"),
      ]);
      setPlans(nextPlans);
      setResources({ vehicles, drivers, routes });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api, date]);

  useEffect(() => { void load(); }, [load]);

  async function savePlan(input, current = null) {
    setSaving(true);
    setError("");
    try {
      if (current) await api.patch(`/api/waste/plans/${current.id}`, input);
      else await api.post("/api/waste/plans", input);
      setEditing(null);
      setCreateOpen(false);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, status) {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/api/waste/plans/${id}/status`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHead eyebrow="OPERATION PLANNING" title="แผนปฏิบัติงานเก็บขยะ" detail="มอบหมายเส้นทาง รถเก็บขยะ และคนขับก่อนเริ่มปฏิบัติงาน" actions={<><label className="waste-date-field"><span>วันที่ปฏิบัติงาน</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button type="button" className="waste-button waste-button--primary" onClick={() => setCreateOpen(true)}>+ สร้างแผนงาน</button></>} />
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-panel">{loading ? <LoadingState /> : !plans.length ? <EmptyState title="ยังไม่มีแผนปฏิบัติงาน" detail="เริ่มจากจัดเตรียมรถ คนขับ และเส้นทาง แล้วสร้างแผนงานสำหรับวันที่เลือก" actionLabel="สร้างแผนปฏิบัติงาน" onAction={() => setCreateOpen(true)} /> : <div className="waste-plan-list">{plans.map((plan) => <article key={plan.id}>
      <div className="waste-plan-list__date"><strong>{formatDate(plan.scheduledDate, { day: "numeric" })}</strong><span>{formatDate(plan.scheduledDate, { month: "short" })}</span></div>
      <div className="waste-plan-list__main"><header><div><small>{plan.planNo}</small><h2>{plan.routeName}</h2></div><StatusBadge value={plan.status} /></header><dl><div><dt>รถเก็บขยะ</dt><dd>{plan.vehicleCode}</dd></div><div><dt>คนขับ</dt><dd>{plan.driverName}</dd></div><div><dt>จุดเก็บ</dt><dd>{formatNumber(plan.collectedStops)} / {formatNumber(plan.stopTotal)} จุด</dd></div><div><dt>เวลา</dt><dd>{plan.scheduledStartAt ? formatDate(plan.scheduledStartAt, { hour: "2-digit", minute: "2-digit" }) : "ไม่ระบุ"}</dd></div></dl></div>
      <div className="waste-plan-list__actions">{plan.status === "SCHEDULED" ? <><button type="button" className="waste-button waste-button--secondary" onClick={() => setEditing(plan)}>แก้ไขแผน</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={() => setStatusConfirmation({ plan, status: "IN_PROGRESS" })}>เริ่มปฏิบัติงาน</button><button type="button" className="waste-button waste-button--quiet" disabled={saving} onClick={() => setStatusConfirmation({ plan, status: "CANCELLED" })}>ยกเลิก</button></> : null}{plan.status === "IN_PROGRESS" || plan.status === "INTERRUPTED" ? <><button type="button" className="waste-button waste-button--secondary" onClick={() => navigate(`tracking?plan=${plan.id}`)}>ติดตาม</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={() => setStatusConfirmation({ plan, status: "COMPLETED" })}>บันทึกเสร็จสิ้น</button></> : null}</div>
    </article>)}</div>}</section>
    {createOpen ? <Modal title="สร้างแผนปฏิบัติงานเก็บขยะ" onClose={() => setCreateOpen(false)}><PlanForm resources={resources} date={date} onCancel={() => setCreateOpen(false)} onSubmit={(input) => savePlan(input)} saving={saving} /></Modal> : null}
    {editing ? <Modal title="แก้ไขแผนปฏิบัติงานเก็บขยะ" onClose={() => setEditing(null)}><PlanForm resources={resources} date={date} initial={editing} onCancel={() => setEditing(null)} onSubmit={(input) => savePlan(input, editing)} saving={saving} /></Modal> : null}
    {statusConfirmation ? <Modal title={STATUS_CONFIRMATIONS[statusConfirmation.status].title} onClose={() => setStatusConfirmation(null)}><div className="waste-confirmation"><strong>{statusConfirmation.plan.planNo} · {statusConfirmation.plan.routeName}</strong><p>{STATUS_CONFIRMATIONS[statusConfirmation.status].detail}</p><footer><button type="button" className="waste-button waste-button--secondary" onClick={() => setStatusConfirmation(null)}>กลับไปตรวจสอบ</button><button type="button" className={statusConfirmation.status === "CANCELLED" ? "waste-button waste-button--danger" : "waste-button waste-button--primary"} disabled={saving} onClick={() => { const { plan, status } = statusConfirmation; setStatusConfirmation(null); void updateStatus(plan.id, status); }}>{STATUS_CONFIRMATIONS[statusConfirmation.status].action}</button></footer></div></Modal> : null}
  </>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { createApi } from "@smart-thapho/web-core/api";
import WasteMap from "../components/WasteMap.jsx";
import { EmptyState, ErrorNotice, LoadingState, PageHead, StatusBadge, formatMoney, formatNumber, toDateInput } from "../components/ui.jsx";

export default function DashboardPage({ token, navigate }) {
  const api = useMemo(() => createApi(token), [token]);
  const [date, setDate] = useState(toDateInput());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api.get(`/api/waste/dashboard?date=${date}`)); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }, [api, date]);

  useEffect(() => { void load(); }, [load]);
  const summary = data?.summary || {};
  const activePlans = data?.activePlans || [];

  return <>
    <PageHead eyebrow="WASTE MANAGEMENT" title="ภาพรวมการเก็บขยะ" detail="ติดตามแผนปฏิบัติงาน รถเก็บขยะ และเหตุที่ต้องดำเนินการจากข้อมูลจริง" actions={<label className="waste-date-field"><span>วันที่ปฏิบัติงาน</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>} />
    <ErrorNotice error={error} onRetry={load} />
    {loading ? <LoadingState /> : <>
      <section className="waste-kpis">
        <article><span>รถพร้อมใช้งาน</span><strong>{formatNumber(summary.availableVehicles)}</strong><small>คัน</small></article>
        <article><span>กำลังปฏิบัติงาน</span><strong>{formatNumber(summary.operatingPlans)}</strong><small>แผน</small></article>
        <article><span>เสร็จสิ้นวันนี้</span><strong>{formatNumber(summary.completedPlans)}</strong><small>แผน</small></article>
        <article className={summary.maintenanceVehicles ? "is-alert" : ""}><span>รถซ่อมบำรุง</span><strong>{formatNumber(summary.maintenanceVehicles)}</strong><small>คัน</small></article>
      </section>
      <section className="waste-dashboard-grid">
        <article className="waste-panel waste-panel--map"><header className="waste-panel__head"><div><p>GPS MONITORING</p><h2>ตำแหน่งรถเก็บขยะ</h2></div><button type="button" className="waste-text-button" onClick={() => navigate("tracking")}>เปิดหน้าติดตาม</button></header><WasteMap plans={activePlans} />{!activePlans.some((plan) => Number.isFinite(Number(plan.latitude)) && Number.isFinite(Number(plan.longitude))) ? <div className="waste-map-note"><strong>ยังไม่มีตำแหน่ง GPS จากรถที่กำลังปฏิบัติงาน</strong><span>ตำแหน่งจะปรากฏเมื่อคนขับส่งข้อมูลผ่าน LINE หรืออุปกรณ์ติดตาม</span></div> : null}</article>
        <article className="waste-panel waste-panel--attention"><header className="waste-panel__head"><div><p>ACTION REQUIRED</p><h2>รายการที่ต้องติดตาม</h2></div><button type="button" className="waste-text-button" onClick={() => navigate("incidents")}>ดูทั้งหมด</button></header><div className="waste-attention-metric"><span>ค่าบริการค้างชำระ</span><strong>{formatMoney(summary.overdueAmount)}</strong><small>{formatNumber(summary.overdueCharges)} รายการ</small></div>{data?.incidents?.length ? <ul className="waste-incident-list">{data.incidents.map((incident) => <li key={incident.id}><span>!</span><div><strong>{incident.vehicleCode || incident.planNo || "เหตุที่แจ้งเข้ามา"}</strong><p>{incident.description}</p></div><StatusBadge value={incident.status} /></li>)}</ul> : <EmptyState title="ไม่มีเหตุค้างดำเนินการ" detail="เมื่อคนขับแจ้งเหตุหรือเจ้าหน้าที่บันทึกเหตุ รายการจะแสดงที่นี่" />}</article>
      </section>
      <section className="waste-panel"><header className="waste-panel__head"><div><p>DAILY OPERATIONS</p><h2>แผนปฏิบัติงานประจำวัน</h2></div><button type="button" className="waste-button waste-button--secondary" onClick={() => navigate("plans")}>จัดการแผนงาน</button></header>{activePlans.length ? <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th>แผนงาน</th><th>เส้นทาง</th><th>รถ / คนขับ</th><th>ความคืบหน้า</th><th>สถานะ</th></tr></thead><tbody>{activePlans.map((plan) => <tr key={plan.id}><td><strong>{plan.planNo}</strong><small>{plan.scheduledDate}</small></td><td>{plan.routeName}</td><td><strong>{plan.vehicleCode}</strong><small>{plan.driverName}</small></td><td><div className="waste-progress"><i><b style={{ width: `${plan.stopTotal ? Math.round((plan.collectedStops / plan.stopTotal) * 100) : 0}%` }} /></i><span>{formatNumber(plan.collectedStops)} / {formatNumber(plan.stopTotal)} จุด</span></div></td><td><StatusBadge value={plan.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="ยังไม่มีแผนปฏิบัติงานในวันนี้" detail="สร้างแผนโดยระบุเส้นทาง รถ และคนขับ เพื่อเริ่มติดตามการเก็บขยะ" actionLabel="สร้างแผนปฏิบัติงาน" onAction={() => navigate("plans")} />}</section>
    </>}
  </>;
}

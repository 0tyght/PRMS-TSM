import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import WasteMap from "../components/WasteMap.jsx";
import { EmptyState, ErrorNotice, LoadingState, PageHead, StatusBadge, formatMoney, formatNumber, toDateInput } from "../components/ui.jsx";
import { wasteDashboardPolicy } from "../domain/WasteDashboardPolicy.js";
import { routeMapColor } from "../lib/wasteMapConfig.js";

export default function DashboardPage({ token, navigate }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [date, setDate] = useState(toDateInput());
  const [data, setData] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api.get(`/api/waste/dashboard?date=${date}`)); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }, [api, date]);

  useEffect(() => { void load(); }, [load]);
  const summary = data?.summary || {};
  const activePlans = data?.activePlans || [];
  const routes = data?.routes || [];
  const selectedRoute = wasteDashboardPolicy.selectedRoute(routes, selectedRouteId);
  const routesWithoutGeometry = wasteDashboardPolicy.routeWithoutGeometryCount(routes);
  const collectionProgress = wasteDashboardPolicy.collectionProgress(summary);

  useEffect(() => {
    setSelectedRouteId((current) =>
      wasteDashboardPolicy.resolveSelectedRouteId(
        routes,
        activePlans,
        current,
      ),
    );
  }, [activePlans, routes]);

  return <>
    <PageHead eyebrow="ศูนย์ควบคุมการเก็บขยะ" title="ภาพรวมการเก็บขยะ" detail="ติดตามแผนปฏิบัติงานเก็บขยะ รถเก็บขยะ และเหตุที่ต้องดำเนินการจากข้อมูลจริง" actions={<label className="waste-date-field"><span>วันที่ปฏิบัติงาน</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>} />
    <ErrorNotice error={error} onRetry={load} />
    {loading ? <LoadingState /> : <>
      <section className="waste-kpis waste-kpis--operational">
        <article><span>รถพร้อมใช้งาน</span><strong>{formatNumber(summary.availableVehicles)}</strong><small>คัน</small></article>
        <article><span>กำลังปฏิบัติงาน</span><strong>{formatNumber(summary.operatingPlans)}</strong><small>แผน</small></article>
        <article><span>เสร็จสิ้นวันนี้</span><strong>{formatNumber(summary.completedPlans)}</strong><small>แผน</small></article>
        <article className={summary.maintenanceVehicles ? "is-alert" : ""}><span>รถซ่อมบำรุง</span><strong>{formatNumber(summary.maintenanceVehicles)}</strong><small>คัน</small></article>
        <article><span>จุดเก็บยืนยันแล้ว</span><strong>{formatNumber(summary.collectedCollectionStops)} / {formatNumber(summary.collectionStopTotal)}</strong><small>{collectionProgress}% ของรอบวันนี้</small></article>
        <article className={summary.openIncidents ? "is-alert" : ""}><span>เหตุที่ยังไม่ปิด</span><strong>{formatNumber(summary.openIncidents)}</strong><small>รายการที่เจ้าหน้าที่ต้องติดตาม</small></article>
      </section>
      <section className="waste-readiness" aria-label="ความพร้อมในการวางแผนปฏิบัติงานเก็บขยะ">
        <button type="button" onClick={() => navigate("plans")}><span>แผนที่รอเริ่มวันนี้</span><strong>{formatNumber(summary.scheduledPlans)}</strong><small>เปิดแผนปฏิบัติงานเก็บขยะ</small></button>
        <button type="button" className={summary.unassignedServiceUsers ? "is-warning" : ""} onClick={() => navigate("service-users")}><span>ผู้ใช้บริการยังไม่มีเส้นทาง</span><strong>{formatNumber(summary.unassignedServiceUsers)}</strong><small>กำหนดเส้นทางรับผิดชอบ</small></button>
        <button type="button" className={summary.serviceUsersWithoutLocation ? "is-warning" : ""} onClick={() => navigate("service-users")}><span>สถานที่รับบริการยังไม่มีพิกัด</span><strong>{formatNumber(summary.serviceUsersWithoutLocation)}</strong><small>ระบุตำแหน่งบนแผนที่</small></button>
        <button type="button" className={routesWithoutGeometry ? "is-warning" : ""} onClick={() => navigate("resources")}><span>เส้นทางที่ต้องดำเนินการ</span><strong>{formatNumber(routesWithoutGeometry)}</strong><small>ตรวจจุดเก็บขยะและคำนวณเส้นทาง</small></button>
      </section>
      <section className="waste-dashboard-grid">
        <article className="waste-panel waste-panel--map">
  <header className="waste-panel__head">
    <div>
      <p>แผนที่การปฏิบัติงาน</p>
      <h2>เส้นทางเก็บขยะในเทศบาลเมืองท่าโพธิ์</h2>
    </div>

    <div className="waste-map-controls">
      <label>
        <span>กรองเส้นทาง</span>

        <select
          value={selectedRouteId}
          onChange={(event) =>
            setSelectedRouteId(
              event.target.value,
            )
          }
        >
          <option value="">
            ทุกเส้นทาง
          </option>

          {routes.map(
            (route) => (
              <option
                value={route.id}
                key={route.id}
              >
                {route.routeCode} — {route.routeName}
              </option>
            ),
          )}
        </select>
      </label>

      <button
        type="button"
        className="waste-text-button"
        onClick={() =>
          navigate("tracking")
        }
      >
        ติดตามรถ
      </button>
    </div>
  </header>

  <WasteMap
    plans={activePlans}
    routes={routes}
    selectedRouteId={selectedRouteId}
  />

  <div
    className="waste-route-map-legend"
    aria-label="สีเส้นทางเก็บขยะ"
  >
    <button
      type="button"
      className={
        selectedRouteId
          ? ""
          : "is-active"
      }
      onClick={() =>
        setSelectedRouteId("")
      }
    >
      <i className="is-all" />
      ทุกเส้นทาง
    </button>

    {routes.map(
      (route, index) => (
        <button
          type="button"
          key={route.id}
          className={
            selectedRouteId === route.id
              ? "is-active"
              : ""
          }
          onClick={() =>
            setSelectedRouteId(
              route.id,
            )
          }
          disabled={
            !route.routeGeojson
          }
          title={
            route.routeGeojson
              ? route.routeName
              : "เส้นทางนี้ยังไม่มีแนวเส้นทางบนแผนที่"
          }
        >
          <i
            style={{
              backgroundColor:
                routeMapColor(
                  route.routeCode ||
                  route.id ||
                  index,
                ),
            }}
          />

          {route.routeCode}
        </button>
      ),
    )}
  </div>

  {selectedRoute ? (
    <div className="waste-map-note">
      <strong>
        {selectedRoute.routeCode} · {selectedRoute.routeName}
      </strong>

      <span>
        {selectedRoute.routeGeojson
          ? `กำลังแสดงเส้นทางที่เลือก • ${formatNumber(selectedRoute.stopCount)} จุดเก็บ • ${formatNumber(selectedRoute.serviceUserCount)} ผู้ใช้บริการ`
          : "เส้นทางนี้ยังไม่มีแนวเส้นทางบนแผนที่ — ไปที่ข้อมูลพื้นฐานเพื่อคำนวณเส้นทาง"}
      </span>
    </div>
  ) : (
    <div className="waste-map-note">
      <strong>
        แสดงทุกเส้นทางในเทศบาลเมืองท่าโพธิ์
      </strong>

      <span>
        แต่ละเส้นทางใช้สีต่างกัน เลือกจากตัวกรองหรือแถบสีเพื่อโฟกัสเฉพาะเส้นทางที่ต้องการ
      </span>
    </div>
  )}
</article>
        <article className="waste-panel waste-panel--attention"><header className="waste-panel__head"><div><p>รายการเร่งดำเนินการ</p><h2>รายการที่ต้องติดตาม</h2></div><button type="button" className="waste-text-button" onClick={() => navigate("incidents")}>ดูทั้งหมด</button></header><div className="waste-attention-metric"><span>ค่าบริการค้างชำระ</span><strong>{formatMoney(summary.overdueAmount)}</strong><small>{formatNumber(summary.overdueCharges)} รายการ</small></div>{data?.incidents?.length ? <ul className="waste-incident-list">{data.incidents.map((incident) => <li key={incident.id}><span>!</span><div><strong>{incident.vehicleCode || incident.planNo || "เหตุที่แจ้งเข้ามา"}</strong><p>{incident.description}</p></div><StatusBadge value={incident.status} /></li>)}</ul> : <EmptyState title="ไม่มีเหตุค้างดำเนินการ" detail="เมื่อพนักงานประจำรถขยะแจ้งเหตุหรือเจ้าหน้าที่บันทึกเหตุ รายการจะแสดงที่นี่" />}</article>
      </section>
      <section className="waste-panel"><header className="waste-panel__head"><div><p>การปฏิบัติงานประจำวัน</p><h2>แผนปฏิบัติงานเก็บขยะ</h2></div><button type="button" className="waste-button waste-button--secondary" onClick={() => navigate("plans")}>จัดการแผนปฏิบัติงานเก็บขยะ</button></header>{activePlans.length ? <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th>แผนปฏิบัติงานเก็บขยะ</th><th>เส้นทาง</th><th>รถ / พนักงานประจำรถขยะ</th><th>ความคืบหน้า</th><th>สถานะ</th></tr></thead><tbody>{activePlans.map((plan) => <tr key={plan.id}><td><strong>{plan.planNo}</strong><small>{plan.scheduledDate}</small></td><td>{plan.routeName}</td><td><strong>{plan.vehicleCode}</strong><small>{plan.driverName}</small></td><td><div className="waste-progress"><i><b style={{ width: `${wasteDashboardPolicy.planProgress(plan)}%` }} /></i><span>{formatNumber(plan.collectedStops)} / {formatNumber(plan.stopTotal)} จุด</span></div></td><td><StatusBadge value={plan.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="ยังไม่มีแผนปฏิบัติงานเก็บขยะในวันนี้" detail="สร้างแผนโดยระบุเส้นทาง รถ และพนักงานประจำรถขยะ เพื่อเริ่มติดตามการเก็บขยะ" actionLabel="สร้างแผนปฏิบัติงานเก็บขยะ" onAction={() => navigate("plans")} />}</section>
    </>}
  </>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import RouteOptimizationManager from "../components/RouteOptimizationManager.jsx";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, formatNumber } from "../components/ui.jsx";

export default function RoutePlanningPage({ token }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRoutes(await api.get("/api/waste/routes"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  return <>
    <PageHead eyebrow="ROUTE PLANNING" title="จัดเส้นทางเก็บขยะ" detail="เลือกเส้นทาง ตรวจจุดเก็บ แล้วให้ระบบจัดลำดับและคำนวณแนวถนนให้อัตโนมัติ" />
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-route-workflow"><article><b>1</b><div><strong>เลือกเส้นทาง</strong><span>เลือกพื้นที่เก็บขยะที่ต้องการจัดรอบวิ่ง</span></div></article><article><b>2</b><div><strong>เลือกต้นทางและปลายทาง</strong><span>จุดแวะดึงจากบ้านผู้ใช้บริการอัตโนมัติ</span></div></article><article><b>3</b><div><strong>คำนวณและยืนยัน</strong><span>ตรวจแนวถนนก่อนบันทึกใช้จริง</span></div></article></section>
    <section className="waste-panel"><header className="waste-panel__head"><div><p>AVAILABLE ROUTES</p><h2>เลือกเส้นทางที่ต้องการจัด</h2></div><span>{formatNumber(routes.length)} เส้นทาง</span></header>
      {loading ? <LoadingState /> : !routes.length ? <EmptyState title="ยังไม่มีเส้นทางเก็บขยะ" detail="เพิ่มข้อมูลเส้นทางจากเมนูรถ คนขับ และข้อมูลเส้นทางก่อน" /> : <div className="waste-route-cards">{routes.map((route) => <article key={route.id}><header><div><small>{route.routeCode}</small><h3>{route.routeName}</h3></div><span className={route.routeGeojson ? "is-ready" : ""}>{route.routeGeojson ? "มีเส้นทางแล้ว" : "รอคำนวณ"}</span></header><p>{route.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p><dl><div><dt>จุดเก็บ</dt><dd>{formatNumber(route.stopCount)} จุด</dd></div><div><dt>ผู้ใช้บริการ</dt><dd>{formatNumber(route.serviceUserCount)} ราย</dd></div></dl><button type="button" className="waste-button waste-button--primary" disabled={route.stopCount < 2} onClick={() => setSelectedRoute(route)}>{route.routeGeojson ? "ตรวจและคำนวณใหม่" : "เริ่มจัดเส้นทาง"}</button>{route.stopCount < 2 ? <small className="waste-route-card-warning">ต้องมีจุดเก็บอย่างน้อย 2 จุด</small> : null}</article>)}</div>}
    </section>
    {selectedRoute ? <Modal title="คำนวณและยืนยันเส้นทาง" onClose={() => setSelectedRoute(null)}><RouteOptimizationManager api={api} route={selectedRoute} onClose={() => setSelectedRoute(null)} onSaved={load} /></Modal> : null}
  </>;
}

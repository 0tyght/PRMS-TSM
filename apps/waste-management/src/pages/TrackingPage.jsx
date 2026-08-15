import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import WasteMap from "../components/WasteMap.jsx";
import { EmptyState, ErrorNotice, LoadingState, PageHead, StatusBadge, formatDate, formatNumber, toDateInput } from "../components/ui.jsx";
import { LocationHistoryPolicy } from "../application/LocationHistoryPolicy.js";

const locationHistoryPolicy = new LocationHistoryPolicy({ maximumGapMinutes: 5 });

export default function TrackingPage({ token, planId }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [date, setDate] = useState(toDateInput()); const [plans, setPlans] = useState([]); const [selectedId, setSelectedId] = useState(""); const [track, setTrack] = useState(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [lastRefresh, setLastRefresh] = useState(null); const [error, setError] = useState("");
  const loadPlans = useCallback(async () => { setLoading(true); setError(""); try { const nextPlans = await api.get(`/api/waste/plans?date=${date}`); setPlans(nextPlans); setSelectedId((current) => nextPlans.some((plan) => plan.id === current) ? current : nextPlans.find((plan) => plan.id === planId)?.id || nextPlans[0]?.id || ""); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); } }, [api, date, planId]);
  const loadTrack = useCallback(async (showProgress = false) => { if (!selectedId) { setTrack(null); return; } if (showProgress) setRefreshing(true); try { setTrack(await api.get(`/api/waste/plans/${selectedId}/track`)); setLastRefresh(new Date()); } catch (requestError) { setError(requestError.message); } finally { if (showProgress) setRefreshing(false); } }, [api, selectedId]);
  useEffect(() => { void loadPlans(); }, [loadPlans]);
  useEffect(() => {
    void loadTrack();
    if (!selectedId) return undefined;
    const timer = window.setInterval(() => { if (!document.hidden) void loadTrack(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadTrack, selectedId]);
  const chosen = plans.find((plan) => plan.id === selectedId);
  const historySegments = useMemo(() => locationHistoryPolicy.createContinuousSegments(track?.locations || []), [track?.locations]);
  return <>
    <PageHead eyebrow="ติดตามตำแหน่งรถเก็บขยะ" title="ติดตามรถเก็บขยะ" detail="ตรวจสอบตำแหน่งล่าสุด เส้นทางที่เดินรถ และการยืนยันจุดเก็บขยะ" actions={<label className="waste-date-field"><span>วันที่ปฏิบัติงาน</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>} />
    <ErrorNotice error={error} onRetry={() => { void loadPlans(); void loadTrack(); }} />
    {loading ? <LoadingState /> : !plans.length ? <EmptyState title="ยังไม่มีแผนปฏิบัติงานเก็บขยะสำหรับติดตาม" detail="ตำแหน่ง GPS จะผูกกับแผนปฏิบัติงานเก็บขยะที่ได้รับมอบหมายแล้วเท่านั้น" /> : <>
      <section className="waste-tracking-select"><label>เลือกแผนปฏิบัติงานเก็บขยะ<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.planNo} — {plan.routeName} ({plan.vehicleCode})</option>)}</select></label>{chosen ? <StatusBadge value={chosen.status} /> : null}<span className="waste-live-indicator"><i /> อัปเดตอัตโนมัติทุก 15 วินาที{lastRefresh ? ` · ล่าสุด ${formatDate(lastRefresh, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span><button type="button" className="waste-button waste-button--secondary" disabled={refreshing} onClick={() => void loadTrack(true)}>{refreshing ? "กำลังรีเฟรช…" : "รีเฟรชตอนนี้"}</button></section>
      {!track ? <LoadingState label="กำลังโหลดประวัติเส้นทาง" /> : <section className="waste-tracking-grid"><article className="waste-panel waste-panel--map"><header className="waste-panel__head"><div><p>ตำแหน่งล่าสุด</p><h2>{track.vehicleCode} · {track.routeName}</h2></div><span className="waste-last-gps">{track.lastGpsAt ? `รับพิกัดล่าสุด ${formatDate(track.lastGpsAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "ยังไม่ได้รับพิกัด GPS"}</span></header><WasteMap plans={[{ ...track, driverName: chosen?.driverName }]} routeGeojson={track.routeGeojson} history={track.locations} historySegments={historySegments} /><div className="waste-tracking-map-legend"><span><i className="is-route" />เส้นทางที่วางแผน</span><span><i className="is-gps" />พิกัด/รอยวิ่ง GPS</span><small>ไม่ลากเส้นเชื่อมข้อมูลที่ขาดช่วงเกิน 5 นาที</small></div></article><aside className="waste-panel waste-tracking-stops"><header className="waste-panel__head"><div><p>จุดเก็บขยะตามเส้นทาง</p><h2>สถานะจุดเก็บขยะ</h2></div></header>{track.stops.length ? <ol>{track.stops.map((stop) => <li key={stop.id}><span>{stop.sequenceNo}</span><div><strong>{stop.stopName}</strong><small>{stop.confirmedAt ? formatDate(stop.confirmedAt, { hour: "2-digit", minute: "2-digit" }) : "ยังไม่ยืนยัน"}</small></div><StatusBadge value={stop.confirmationStatus || "SCHEDULED"} /></li>)}</ol> : <EmptyState title="ยังไม่ได้กำหนดจุดเก็บขยะ" detail="เพิ่มผู้ใช้บริการและกำหนดจุดในเส้นทางก่อนเริ่มติดตาม" />}</aside></section>}
      {track ? <section className="waste-panel waste-location-log"><header className="waste-panel__head"><div><p>ประวัติตำแหน่ง</p><h2>ประวัติตำแหน่งที่ได้รับ</h2></div><span>{formatNumber(track.locations.length)} จุด</span></header>{track.locations.length ? <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th>เวลา</th><th>ละติจูด</th><th>ลองจิจูด</th><th>ความเร็ว</th><th>แหล่งข้อมูล</th></tr></thead><tbody>{track.locations.slice().reverse().map((point, index) => <tr key={`${point.recordedAt}-${index}`}><td>{formatDate(point.recordedAt, { dateStyle: "short", timeStyle: "short" })}</td><td>{Number(point.latitude).toFixed(6)}</td><td>{Number(point.longitude).toFixed(6)}</td><td>{point.speedKph == null ? "-" : `${Number(point.speedKph).toFixed(1)} กม./ชม.`}</td><td>{point.source}</td></tr>)}</tbody></table></div> : <EmptyState title="ยังไม่มีประวัติตำแหน่ง" detail="ข้อมูลจะบันทึกเมื่อพนักงานประจำรถขยะส่งตำแหน่งผ่าน LINE หรืออุปกรณ์ GPS" />}</section> : null}
    </>}
  </>;
}

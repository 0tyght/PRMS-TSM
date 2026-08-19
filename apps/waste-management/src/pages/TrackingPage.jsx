import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import WasteMap from "../components/WasteMap.jsx";
import { EmptyState, ErrorNotice, LoadingState, PageHead, StatusBadge, formatDate, formatNumber, toDateInput } from "../components/ui.jsx";
import { LocationHistoryPolicy } from "../application/LocationHistoryPolicy.js";

const locationHistoryPolicy = new LocationHistoryPolicy({ maximumGapMinutes: 5 });

function gpsPresentation(track) {
  if (!track?.lastGpsAt) {
    return {
      key: "idle",
      label: track?.status === "SCHEDULED" ? "รอเริ่มส่ง GPS" : "ยังไม่ได้รับ GPS",
      detail: track?.status === "SCHEDULED"
        ? "ตำแหน่งจะปรากฏเมื่อพนักงานเริ่มปฏิบัติงาน"
        : "ยังไม่มีตำแหน่งที่ผูกกับแผนนี้",
    };
  }

  if (track.status === "COMPLETED") {
    return {
      key: "history",
      label: "ตำแหน่งสุดท้ายของรอบ",
      detail: formatDate(track.lastGpsAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  }

  const receivedAt = new Date(track.lastGpsAt);
  const ageMs = Date.now() - receivedAt.getTime();

  if (Number.isFinite(ageMs) && ageMs <= 90_000) {
    return {
      key: "live",
      label: "GPS สด",
      detail: `รับล่าสุด ${formatDate(track.lastGpsAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
    };
  }

  if (Number.isFinite(ageMs) && ageMs <= 5 * 60_000) {
    return {
      key: "warning",
      label: "GPS ช้ากว่าปกติ",
      detail: `รับล่าสุด ${formatDate(track.lastGpsAt, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
    };
  }

  return {
    key: "stale",
    label: "GPS ขาดการอัปเดต",
    detail: `รับล่าสุด ${formatDate(track.lastGpsAt, { dateStyle: "short", timeStyle: "medium" })}`,
  };
}

function collectionProgress(stops = []) {
  const total = stops.length;
  const collected = stops.filter((stop) => stop.confirmationStatus === "COLLECTED").length;
  return {
    total,
    collected,
    percent: total > 0 ? Math.round((collected / total) * 100) : 0,
  };
}

export default function TrackingPage({ token, planId }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [date, setDate] = useState(toDateInput());
  const [plans, setPlans] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState("");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/api/waste/plans?date=${date}`);
      const nextPlans = response.filter((plan) => plan.publicationStatus === "PUBLISHED");
      setPlans(nextPlans);
      setSelectedId((current) =>
        nextPlans.some((plan) => plan.id === current)
          ? current
          : nextPlans.find((plan) => plan.id === planId)?.id || nextPlans[0]?.id || ""
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api, date, planId]);

  const loadTrack = useCallback(async (showProgress = false) => {
    if (!selectedId) {
      setTrack(null);
      return;
    }
    if (showProgress) setRefreshing(true);
    try {
      setTrack(await api.get(`/api/waste/plans/${selectedId}/track`));
      setLastRefresh(new Date());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showProgress) setRefreshing(false);
    }
  }, [api, selectedId]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);
  useEffect(() => {
    setTrack(null);
  }, [selectedId]);
  useEffect(() => {
    void loadTrack();
    if (!selectedId) return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadTrack();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadTrack, selectedId]);

  const chosen = plans.find((plan) => plan.id === selectedId);
  const historySegments = useMemo(
    () => locationHistoryPolicy.createContinuousSegments(track?.locations || []),
    [track?.locations],
  );
  const progress = useMemo(() => collectionProgress(track?.stops || []), [track?.stops]);
  const nextStop = useMemo(
    () => (track?.stops || []).find((stop) => !["COLLECTED", "SKIPPED"].includes(String(stop.confirmationStatus || "").toUpperCase())) || null,
    [track?.stops],
  );
  const gps = useMemo(() => gpsPresentation(track), [track?.lastGpsAt, track?.status]);

  const hasPlanGps = Boolean(
    track?.lastGpsAt &&
    track?.latitude != null &&
    track?.longitude != null &&
    Number.isFinite(Number(track.latitude)) &&
    Number.isFinite(Number(track.longitude))
  );

  const historyEmptyDetail = track?.status === "SCHEDULED"
    ? "รอพนักงานประจำรถขยะเริ่มปฏิบัติงาน ตำแหน่งรถจะปรากฏเมื่อเริ่มส่ง GPS"
    : "ยังไม่มีพิกัด GPS ที่บันทึกสำหรับแผนปฏิบัติงานเก็บขยะนี้";

  return <>
    <PageHead
      eyebrow="ติดตามตำแหน่งรถเก็บขยะ"
      title="ติดตามรถเก็บขยะ"
      detail="ตรวจสอบตำแหน่งล่าสุดของแผนที่เลือก รอยวิ่ง GPS ความคืบหน้าจุดเก็บขยะ และประวัติตำแหน่ง"
      actions={<label className="waste-date-field"><span>วันที่ปฏิบัติงาน</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
    />
    <ErrorNotice error={error} onRetry={() => { void loadPlans(); void loadTrack(); }} />

    {loading ? <LoadingState /> : !plans.length ? (
      <EmptyState
        title="ยังไม่มีแผนที่ประกาศแล้วสำหรับติดตาม"
        detail="หน้าติดตามรถแสดงเฉพาะแผนที่ประกาศใช้งานแล้ว และใช้ข้อมูล GPS ที่ผูกกับแผนนั้นเท่านั้น"
      />
    ) : <>
      <section className="waste-tracking-select">
        <label>
          เลือกแผนปฏิบัติงานเก็บขยะ
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.planNo} — {plan.routeName} ({plan.vehicleCode})</option>)}
          </select>
        </label>
        {chosen ? <StatusBadge value={chosen.status} /> : null}
        <span className="waste-live-indicator"><i /> อัปเดตอัตโนมัติทุก 15 วินาที{lastRefresh ? ` · ล่าสุด ${formatDate(lastRefresh, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}</span>
        <button type="button" className="waste-button waste-button--secondary" disabled={refreshing} onClick={() => void loadTrack(true)}>
          {refreshing ? "กำลังรีเฟรช…" : "รีเฟรชตอนนี้"}
        </button>
      </section>

      {!track ? <LoadingState label="กำลังโหลดข้อมูลติดตาม" /> : <>
        <section className="waste-tracking-summary">
          <article>
            <span>สถานะแผน</span>
            <strong><StatusBadge value={track.status} /></strong>
            <small>{chosen?.scheduledStartAt ? `เริ่ม ${formatDate(chosen.scheduledStartAt, { dateStyle: "short", timeStyle: "short" })}` : "ไม่ระบุเวลาเริ่ม"}</small>
          </article>
          <article>
            <span>รถและพนักงาน</span>
            <strong>{track.vehicleCode}</strong>
            <small>{track.driverName || chosen?.driverName || "ไม่ระบุพนักงานประจำรถขยะ"}</small>
          </article>
          <article>
            <span>ความคืบหน้าจุดเก็บขยะ</span>
            <strong>{progress.collected}/{progress.total} จุด</strong>
            <div className="waste-tracking-progress"><i><b style={{ width: `${progress.percent}%` }} /></i><small>{progress.percent}%</small></div>
          </article>
          <article className={`is-gps-${gps.key}`}>
            <span>สถานะ GPS</span>
            <strong>{gps.label}</strong>
            <small>{gps.detail}</small>
          </article>
        </section>

        <section className="waste-tracking-grid">
          <article className="waste-panel waste-panel--map">
            <header className="waste-panel__head waste-panel__head--tracking-map">
              <div><p>เส้นทางปฏิบัติงานของแผนที่เลือก</p><h2>{track.vehicleCode} · {track.routeName}</h2></div>
              <div className="waste-tracking-map-context">
                {nextStop ? <span className="waste-next-stop-pill">จุดถัดไป · {nextStop.sequenceNo} {nextStop.stopName}</span> : <span className="waste-next-stop-pill is-complete">ไม่มีจุดค้างในเส้นทาง</span>}
                <span className={`waste-last-gps is-${gps.key}`}>{gps.label}</span>
              </div>
            </header>
            <WasteMap
              plans={hasPlanGps ? [{ ...track, driverName: track.driverName || chosen?.driverName }] : []}
              routeGeojson={track.routeGeojson}
              routeStops={track.stops || []}
              history={track.locations || []}
              historySegments={historySegments}
              trackingMode
              trackingStatus={track.status}
              activeStopId={nextStop?.id || ""}
              focusKey={`${selectedId}:${track.routeName || ""}`}
            />
            <div className="waste-tracking-map-legend waste-tracking-map-legend--v3">
              <span><i className="is-route-planned" />เส้นทางตามแผน · สีอ่อน</span>
              <span><i className="is-route-travelled" />รอยวิ่งจริง · สีเข้ม</span>
              <span><i className="is-next-stop" />จุดถัดไป</span>
              <span><i className="is-truck" />รถเก็บขยะ</span>
              <small>เส้นประเคลื่อนไหวแสดงแนวเส้นทางขณะกำลังปฏิบัติงาน ส่วนสีเข้มวาดจาก GPS ของแผนนี้จริง และไม่เชื่อมช่วงข้อมูลที่ห่างเกิน 5 นาที</small>
            </div>
          </article>

          <aside className="waste-panel waste-tracking-stops">
            <header className="waste-panel__head">
              <div><p>จุดเก็บขยะตามเส้นทาง</p><h2>สถานะจุดเก็บขยะ</h2></div>
              <span>{progress.collected}/{progress.total} จุด</span>
            </header>
            {track.stops.length ? <ol>
              {track.stops.map((stop) => {
                const stopStatus = String(stop.confirmationStatus || "SCHEDULED").toUpperCase();
                const isNext = nextStop?.id === stop.id;
                return <li key={stop.id} className={`${stopStatus === "COLLECTED" ? "is-collected" : ""}${isNext ? " is-next" : ""}${stopStatus === "SKIPPED" ? " is-skipped" : ""}`}>
                  <span>{stopStatus === "COLLECTED" ? "✓" : stop.sequenceNo}</span>
                  <div>
                    <strong>{stop.stopName}</strong>
                    <small>{isNext ? "จุดถัดไปในลำดับการปฏิบัติงาน" : stop.confirmedAt ? `ยืนยัน ${formatDate(stop.confirmedAt, { hour: "2-digit", minute: "2-digit" })}` : stopStatus === "SKIPPED" ? "ข้ามจุดนี้ระหว่างปฏิบัติงาน" : "ยังไม่ถึงจุดนี้"}</small>
                  </div>
                  <StatusBadge value={stop.confirmationStatus || "SCHEDULED"} />
                </li>;
              })}
            </ol> : <EmptyState title="ยังไม่ได้กำหนดจุดเก็บขยะ" detail="เพิ่มผู้ใช้บริการและกำหนดจุดในเส้นทางก่อนเริ่มติดตาม" />}
          </aside>
        </section>

        <section className="waste-panel waste-location-log">
          <header className="waste-panel__head">
            <div><p>ประวัติตำแหน่งของแผน</p><h2>ประวัติตำแหน่งที่ได้รับ</h2></div>
            <span>{formatNumber(track.locations.length)} จุด</span>
          </header>
          {track.locations.length ? <div className="waste-table-wrap"><table className="waste-table">
            <thead><tr><th>เวลา</th><th>ละติจูด</th><th>ลองจิจูด</th><th>ความเร็ว</th><th>ความแม่นยำ</th><th>แหล่งข้อมูล</th></tr></thead>
            <tbody>{track.locations.slice().reverse().map((point, index) => <tr key={`${point.recordedAt}-${index}`}>
              <td>{formatDate(point.recordedAt, { dateStyle: "short", timeStyle: "short" })}</td>
              <td>{Number(point.latitude).toFixed(6)}</td>
              <td>{Number(point.longitude).toFixed(6)}</td>
              <td>{point.speedKph == null ? "-" : `${Number(point.speedKph).toFixed(1)} กม./ชม.`}</td>
              <td>{point.accuracyM == null ? "-" : `±${Number(point.accuracyM).toFixed(0)} ม.`}</td>
              <td>{point.source}</td>
            </tr>)}</tbody>
          </table></div> : <EmptyState
            title={track.status === "SCHEDULED" ? "รอเริ่มปฏิบัติงาน" : "ยังไม่มีประวัติตำแหน่ง"}
            detail={historyEmptyDetail}
          />}
        </section>
      </>}
    </>}
  </>;
}
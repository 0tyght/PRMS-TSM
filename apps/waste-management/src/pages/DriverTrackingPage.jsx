import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";

function formatDateTime(value) {
  if (!value) return "ยังไม่มีข้อมูล";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ยังไม่มีข้อมูล";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

const STATUS_LABELS = Object.freeze({
  SCHEDULED: "รอเริ่มปฏิบัติงาน",
  IN_PROGRESS: "กำลังปฏิบัติงาน",
  INTERRUPTED: "หยุดชะงักชั่วคราว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
});

export default function DriverTrackingPage({ trackingToken }) {
  const api = useMemo(() => createWasteApplication(trackingToken), [trackingToken]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [sentCount, setSentCount] = useState(0);
  const watchIdRef = useRef(null);
  const lastAttemptRef = useRef(0);
  const wakeLockRef = useRef(null);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!trackingToken) {
      setError("ไม่พบสิทธิ์ติดตาม กรุณาเปิดลิงก์จากเมนูงานพนักงานประจำรถขยะใน LINE");
      setLoading(false);
      return undefined;
    }
    api.get("/api/waste/driver-tracking/session").then((data) => {
      if (mounted) setSession(data);
    }).catch((requestError) => {
      if (mounted) setError(requestError.message);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; stopTracking(); };
  }, [api, stopTracking, trackingToken]);

  const startTracking = useCallback(async () => {
    setError("");
    if (!navigator.geolocation) {
      setError("อุปกรณ์นี้ไม่รองรับ GPS กรุณาเปิดจากโทรศัพท์ที่อนุญาตตำแหน่งได้");
      return;
    }
    if (!session?.canTrack) {
      setError("แผนนี้ยังไม่ได้เริ่ม หรือสิ้นสุดการปฏิบัติงานแล้ว");
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock?.request?.("screen");
    } catch {
      wakeLockRef.current = null;
    }
    setActive(true);
    watchIdRef.current = navigator.geolocation.watchPosition(async (position) => {
      const now = Date.now();
      const nextPosition = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
        speedKph: position.coords.speed == null ? null : Math.max(0, position.coords.speed * 3.6),
        recordedAt: new Date(position.timestamp || now).toISOString(),
      };
      setLastPosition(nextPosition);
      if (now - lastAttemptRef.current < 10_000) return;
      lastAttemptRef.current = now;
      try {
        const result = await api.post("/api/waste/driver-tracking/location", nextPosition);
        if (result.accepted) {
          setLastSentAt(result.serverTime);
          setSentCount((count) => count + 1);
        }
        setError("");
      } catch (requestError) {
        setError(requestError.message);
      }
    }, (positionError) => {
      const messages = {
        1: "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาต GPS แล้วกดเริ่มอีกครั้ง",
        2: "โทรศัพท์ไม่สามารถระบุตำแหน่งได้ กรุณาตรวจสอบสัญญาณ GPS",
        3: "การอ่านตำแหน่งใช้เวลานานเกินไป ระบบจะลองใหม่อัตโนมัติ",
      };
      setError(messages[positionError.code] || "ไม่สามารถอ่านตำแหน่งจากอุปกรณ์ได้");
      if (positionError.code === 1) stopTracking();
    }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 });
  }, [api, session, stopTracking]);

  if (loading) return <main className="waste-driver-tracking"><section className="waste-driver-card"><p>กำลังตรวจสอบแผนปฏิบัติงานเก็บขยะ…</p></section></main>;

  return <main className="waste-driver-tracking">
    <section className="waste-driver-card">
      <header><span className="waste-driver-card__mark">ขย</span><div><small>SMART THA PHO · งานพนักงานประจำรถขยะ</small><h1>ติดตาม GPS รถเก็บขยะ</h1></div></header>
      {session ? <>
        <div className="waste-driver-card__status" data-active={active}><i />{active ? "กำลังส่งตำแหน่งต่อเนื่อง" : STATUS_LABELS[session.status] || session.status}</div>
        <dl>
          <div><dt>แผนปฏิบัติงานเก็บขยะ</dt><dd>{session.planNo}</dd></div>
          <div><dt>เส้นทาง</dt><dd>{session.routeCode} · {session.routeName}</dd></div>
          <div><dt>รถเก็บขยะ</dt><dd>{session.vehicleCode} · {session.registrationNo}</dd></div>
          <div><dt>พนักงานประจำรถขยะ</dt><dd>{session.driverName}</dd></div>
        </dl>
        <section className="waste-driver-card__telemetry">
          <div><small>ส่งสำเร็จ</small><strong>{sentCount} ครั้ง</strong></div>
          <div><small>อัปเดตล่าสุด</small><strong>{formatDateTime(lastSentAt)}</strong></div>
          {lastPosition ? <p>ความแม่นยำประมาณ {Math.round(lastPosition.accuracyM || 0)} เมตร</p> : null}
        </section>
      </> : null}
      {error ? <p className="waste-driver-card__error" role="alert">{error}</p> : null}
      {session?.canTrack ? active
        ? <button type="button" className="waste-button waste-button--danger waste-driver-card__button" onClick={stopTracking}>หยุดส่งตำแหน่ง</button>
        : <button type="button" className="waste-button waste-button--primary waste-driver-card__button" onClick={() => void startTracking()}>เริ่มส่ง GPS ต่อเนื่อง</button>
        : null}
      <p className="waste-driver-card__notice">ต้องเปิดหน้านี้ไว้ระหว่างปฏิบัติงาน หากล็อกหน้าจอหรือปิด LINE ระบบโทรศัพท์อาจหยุดส่งตำแหน่งชั่วคราว</p>
    </section>
  </main>;
}

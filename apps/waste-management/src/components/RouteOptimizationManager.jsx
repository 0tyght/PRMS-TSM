import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorNotice, LoadingState, formatNumber } from "./ui.jsx";
import WasteMap from "./WasteMap.jsx";

function formatRouteDistance(value) {
  return `${(Number(value || 0) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`;
}

function formatRouteDuration(value) {
  const minutes = Math.max(1, Math.round(Number(value || 0) / 60));
  return minutes < 60 ? `${minutes.toLocaleString("th-TH")} นาที` : `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

function stopLabel(stop) {
  return `${stop.sequenceNo}. ${stop.stopName}${stop.serviceNo ? ` (${stop.serviceNo})` : ""}`;
}

export default function RouteOptimizationManager({ api, route, onClose, onSaved }) {
  const [stops, setStops] = useState([]);
  const [startStopId, setStartStopId] = useState("");
  const [endStopId, setEndStopId] = useState("");
  const [selectionMode, setSelectionMode] = useState("START");
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get(`/api/waste/routes/${route.id}/stops`).then((nextStops) => {
      if (!active) return;
      setStops(nextStops);
      setStartStopId(nextStops[0]?.id || "");
    }).catch((requestError) => {
      if (active) setError(requestError.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api, route.id]);

  const previewStops = useMemo(() => stops.map((stop) => ({
    ...stop,
    markerRole: stop.id === startStopId ? "START" : stop.id === endStopId ? "END" : "STOP",
  })), [endStopId, startStopId, stops]);

  function changeStart(value) {
    setStartStopId(value);
    if (value === endStopId) setEndStopId("");
    setProposal(null);
  }

  function changeEnd(value) {
    setEndStopId(value);
    setProposal(null);
  }

  const selectStopOnMap = useCallback((stop) => {
    if (selectionMode === "START") {
      setStartStopId(stop.id);
      if (stop.id === endStopId) setEndStopId("");
      setSelectionMode("END");
    } else if (stop.id !== startStopId) {
      setEndStopId(stop.id);
    }
    setProposal(null);
  }, [endStopId, selectionMode, startStopId]);

  async function calculate() {
    setSaving(true);
    setError("");
    try {
      const result = await api.post(`/api/waste/routes/${route.id}/optimization-proposals`, {
        startStopId,
        endStopId: endStopId || null,
      });
      setProposal(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/api/waste/routes/${route.id}/optimization-confirmations`, { proposalId: proposal.proposalId });
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const mappedProposalStops = proposal?.stops.map((stop, index) => ({
    ...stop,
    markerRole: index === 0 ? "START" : index === proposal.stops.length - 1 && endStopId ? "END" : "STOP",
  })) || [];

  return <>
    <div className="waste-route-steps" aria-label="ขั้นตอนจัดเส้นทาง"><b>1</b><span>เลือกต้นทางและปลายทาง</span><b>2</b><span>ตรวจเส้นทางที่ระบบคำนวณ</span><b>3</b><span>ยืนยันใช้งาน</span></div>
    <p className="waste-modal-intro">จุดแวะเก็บขยะทั้งหมดดึงจากผู้ใช้บริการใน <strong>{route.routeName}</strong> อัตโนมัติ เจ้าหน้าที่เลือกเฉพาะจุดเริ่มต้นและจุดสิ้นสุด</p>
    <ErrorNotice error={error} />
    {loading ? <LoadingState label="กำลังโหลดจุดเก็บขยะ" /> : !stops.length ? <EmptyState title="เส้นทางนี้ยังไม่มีจุดเก็บ" detail="ไปที่เมนูผู้ใช้บริการ แล้วกำหนดเส้นทางและตำแหน่งให้แต่ละรายก่อน" /> : <>
      <div className="waste-route-endpoints">
        <label><span>จุดเริ่มต้น</span><select value={startStopId} onChange={(event) => changeStart(event.target.value)}>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stopLabel(stop)}</option>)}</select></label>
        <label><span>จุดสิ้นสุด</span><select value={endStopId} onChange={(event) => changeEnd(event.target.value)}><option value="">กลับมาที่จุดเริ่มต้น</option>{stops.filter((stop) => stop.id !== startStopId).map((stop) => <option key={stop.id} value={stop.id}>{stopLabel(stop)}</option>)}</select></label>
      </div>
      {!proposal ? <div className="waste-route-map-picker"><strong>หรือเลือกบนแผนที่</strong><div><button type="button" className={selectionMode === "START" ? "is-active" : ""} onClick={() => setSelectionMode("START")}>1. เลือกจุดเริ่มต้น</button><button type="button" className={selectionMode === "END" ? "is-active" : ""} onClick={() => setSelectionMode("END")}>2. เลือกจุดสิ้นสุด</button><button type="button" onClick={() => { setEndStopId(""); setProposal(null); }}>กลับจุดเริ่มต้น</button></div><span>กดปุ่มที่ต้องการ แล้วคลิกจุดเก็บบนแผนที่</span></div> : null}
      <div className="waste-route-privacy-note"><strong>ทำงานอัตโนมัติ</strong><span>ระบบเรียงจุดแวะที่เหลือและคำนวณแนวเส้นตามถนน โดยส่งเฉพาะพิกัดไปยังบริการแผนที่</span></div>
      {proposal ? <>
        <div className="waste-route-proposal-summary"><article><span>จุดเก็บทั้งหมด</span><strong>{formatNumber(proposal.stops.length)} จุด</strong></article><article><span>ระยะทางประมาณ</span><strong>{formatRouteDistance(proposal.distanceMeters)}</strong></article><article><span>เวลาเดินรถประมาณ</span><strong>{formatRouteDuration(proposal.durationSeconds)}</strong></article></div>
        <div className="waste-route-proposal-map"><WasteMap routeGeojson={proposal.routeGeojson} routeStops={mappedProposalStops} /></div>
        <div className="waste-route-map-legend"><span><i className="is-start" />จุดเริ่มต้น</span><span><i />จุดแวะเก็บขยะ</span><span><i className="is-end" />จุดสิ้นสุด</span></div>
        <h3 className="waste-route-proposal-title">ลำดับการเดินรถที่ระบบแนะนำ</h3>
        <ol className="waste-stop-order-list">{proposal.stops.map((stop, index) => <li key={stop.id}><b>{index + 1}</b><div><strong>{stop.stopName}</strong><small>{index === 0 ? "จุดเริ่มต้น" : index === proposal.stops.length - 1 && endStopId ? "จุดสิ้นสุด" : "จุดแวะเก็บขยะ"}{stop.serviceNo ? ` · ${stop.serviceNo}` : ""}</small></div></li>)}</ol>
      </> : <>
        <div className="waste-route-proposal-map waste-route-proposal-map--selectable"><WasteMap routeGeojson={route.routeGeojson} routeStops={previewStops} onStopClick={selectStopOnMap} /></div>
        <section className="waste-route-ready"><strong>พร้อมคำนวณจากจุดเก็บ {formatNumber(stops.length)} จุด</strong><p>ตรวจจุดเริ่มต้นและจุดสิ้นสุด แล้วกดคำนวณ ระบบจะจัดลำดับจุดแวะให้อัตโนมัติ</p></section>
      </>}
    </>}
    <footer className="waste-modal-actions"><button type="button" className="waste-button waste-button--secondary" onClick={onClose}>ปิด</button>{proposal ? <><button type="button" className="waste-button waste-button--secondary" disabled={saving} onClick={() => setProposal(null)}>เปลี่ยนจุด</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={confirm}>{saving ? "กำลังยืนยัน…" : "ยืนยันใช้เส้นทางนี้"}</button></> : <button type="button" className="waste-button waste-button--primary" disabled={loading || saving || stops.length < 2 || !startStopId} onClick={calculate}>{saving ? "กำลังคำนวณ…" : "คำนวณเส้นทาง"}</button>}</footer>
  </>;
}

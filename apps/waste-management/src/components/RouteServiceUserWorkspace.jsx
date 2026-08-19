import { useEffect, useMemo, useRef, useState } from "react";
import WasteMap from "./WasteMap.jsx";
import { EmptyState, ErrorNotice, LoadingState, formatNumber } from "./ui.jsx";

function distance(value) {
  return `${(Number(value || 0) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`;
}
function duration(value) {
  const minutes = Math.max(1, Math.round(Number(value || 0) / 60));
  return minutes < 60 ? `${minutes.toLocaleString("th-TH")} นาที` : `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

export default function RouteServiceUserWorkspace({ api, route, onClose, onSaved }) {
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const rows = await api.get("/api/waste/service-users");
        if (!cancelled) setUsers(rows.filter((user) =>
          user.isActive && !user.routeId && user.latitude != null && user.longitude != null
        ));
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [user.serviceNo, user.fullName, user.houseNo, user.villageName, user.phone]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(term))
    );
  }, [search, users]);

  useEffect(() => {
    setProposal(null); setError("");
    const total = Number(route.stopCount || 0) + selectedIds.length;
    if (!selectedIds.length || total < 2) return undefined;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(async () => {
      setCalculating(true);
      try {
        const result = await api.post(`/api/waste/routes/${route.id}/service-user-proposals`, { serviceUserIds: selectedIds });
        if (requestSequence.current === sequence) setProposal(result);
      } catch (requestError) {
        if (requestSequence.current === sequence) { setError(requestError.message); setProposal(null); }
      } finally {
        if (requestSequence.current === sequence) setCalculating(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [api, route.id, route.stopCount, selectedIds]);

  function toggle(id) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
  }

  async function confirm() {
    if (!proposal?.proposalId) return;
    setSaving(true); setError("");
    try {
      await api.post(`/api/waste/routes/${route.id}/service-user-confirmations`, { proposalId: proposal.proposalId });
      await onSaved?.();
      onClose?.();
    } catch (requestError) {
      setError(requestError.message); setProposal(null);
    } finally { setSaving(false); }
  }

  const totalAfter = Number(route.stopCount || 0) + selectedIds.length;

  return <section className="waste-route-user-workspace">
    <header className="waste-route-user-workspace__head">
      <div><small>{route.routeCode}</small><h3>{route.routeName}</h3><p>เลือกผู้ใช้บริการที่ยังไม่มีเส้นทาง ระบบจะคำนวณแนวถนนและลำดับจุดใหม่ให้ตรวจสอบก่อนบันทึกจริง</p></div>
      <div className="waste-route-user-workspace__summary"><span>จุดเดิม <b>{formatNumber(route.stopCount)}</b></span><span>เลือกเพิ่ม <b>{formatNumber(selectedIds.length)}</b></span><span>หลังยืนยัน <b>{formatNumber(totalAfter)}</b></span></div>
    </header>
    <ErrorNotice error={error} />
    <div className="waste-route-user-workspace__grid">
      <aside className="waste-route-user-picker">
        <label><span>ค้นหาผู้ใช้บริการที่ยังไม่มีเส้นทาง</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="เลขผู้ใช้บริการ ชื่อ บ้านเลขที่ หรือเบอร์โทร" /></label>
        {loading ? <LoadingState label="กำลังโหลดผู้ใช้บริการ" /> : !filteredUsers.length ? <EmptyState title="ไม่มีผู้ใช้บริการที่พร้อมเพิ่ม" detail="ต้องเพิ่มทะเบียนผู้ใช้บริการเก็บขยะและระบุพิกัดสถานที่รับบริการก่อน แล้วรายการที่ยังไม่มีเส้นทางจะปรากฏที่นี่" /> : <div className="waste-route-user-picker__list">{filteredUsers.map((user) => {
          const selected = selectedIds.includes(user.id);
          return <button type="button" key={user.id} className={selected ? "is-selected" : ""} onClick={() => toggle(user.id)} disabled={saving}><i>{selected ? "✓" : "+"}</i><div><strong>{user.serviceNo} · {user.fullName}</strong><span>บ้าน {user.houseNo} · หมู่ {user.villageNo} {user.villageName || ""}</span><small>{user.lineUserId ? "เชื่อม LINE แล้ว" : "ยังไม่เชื่อม LINE — สามารถเชื่อมภายหลังได้"}</small></div></button>;
        })}</div>}
      </aside>
      <div className="waste-route-user-preview">
        <header><div><small>PREVIEW ก่อนยืนยัน</small><h3>เส้นทางที่จะเกิดขึ้นจริง</h3></div>{proposal ? <span>{distance(proposal.distanceMeters)} · {duration(proposal.durationSeconds)}</span> : null}</header>
        {calculating ? <div className="waste-route-user-preview__loading">กำลังคำนวณแนวถนนใหม่…</div> : null}
        {proposal ? <><WasteMap routeGeojson={proposal.routeGeojson} routeStops={proposal.stops} /><ol className="waste-route-user-preview__sequence">{proposal.stops.map((stop) => <li key={stop.id}><b>{stop.sequenceNo}</b><span>{stop.stopName}</span>{stop.assignmentCandidate ? <em>เพิ่มใหม่</em> : <small>จุดเดิม</small>}</li>)}</ol></> : <div className="waste-route-user-preview__empty"><strong>{totalAfter < 2 ? "ต้องมีอย่างน้อย 2 สถานที่รับบริการ" : "เลือกผู้ใช้บริการเพื่อดูเส้นทาง"}</strong><p>{totalAfter < 2 ? "เส้นทางใหม่ต้องเลือกผู้ใช้บริการอย่างน้อย 2 รายเพื่อคำนวณแนวถนนและลำดับก่อนยืนยัน" : "เมื่อเลือกผู้ใช้บริการ ระบบจะคำนวณเส้นทางใหม่อัตโนมัติและยังไม่เปลี่ยนข้อมูลจริงจนกว่าจะกดยืนยัน"}</p></div>}
      </div>
    </div>
    <footer className="waste-route-user-workspace__actions"><div><span>ข้อมูลจริงจะเปลี่ยนเมื่อกด “ยืนยันเส้นทางและจุดเก็บขยะ” เท่านั้น</span><small>ผู้ใช้บริการที่ยังไม่เชื่อม LINE สามารถอยู่ในเส้นทางและแผนปฏิบัติงานเก็บขยะได้ตามปกติ</small></div><button type="button" className="waste-button waste-button--secondary" onClick={onClose} disabled={saving}>ยกเลิก</button><button type="button" className="waste-button waste-button--primary" onClick={() => void confirm()} disabled={!proposal || calculating || saving}>{saving ? "กำลังยืนยัน…" : "ยืนยันเส้นทางและจุดเก็บขยะ"}</button></footer>
  </section>;
}
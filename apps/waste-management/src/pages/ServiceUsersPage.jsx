import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import LocationPicker from "../components/LocationPicker.jsx";
import WasteMap from "../components/WasteMap.jsx";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatNumber } from "../components/ui.jsx";
import { wasteServiceUserPolicy } from "../domain/WasteServiceUserPolicy.js";
import { routeComparisonPolicy } from "../application/RouteComparisonPolicy.js";

function formatRouteDistance(value) {
  return `${(Number(value || 0) / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })} กม.`;
}

function formatRouteDuration(value) {
  const minutes = Math.max(1, Math.round(Number(value || 0) / 60));
  return minutes < 60 ? `${minutes.toLocaleString("th-TH")} นาที` : `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

function RouteAssignmentWorkspace({ user, routes, suggestions, loading, saving, error, onCalculate, onConfirm, onEditLocation }) {
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [proposal, setProposal] = useState(null);
  const calculationSequence = useRef(0);

  useEffect(() => {
    const preferred = suggestions.find((route) => route.recommended && route.id !== user.routeId)
      || suggestions.find((route) => route.id !== user.routeId)
      || suggestions[0];
    setSelectedRouteId(preferred?.id || user.routeId || "");
    setProposal(null);
    if (preferred && preferred.id !== user.routeId) {
      const requestId = ++calculationSequence.current;
      void onCalculate(preferred).then((result) => { if (result && calculationSequence.current === requestId) setProposal(result); });
    }
  }, [suggestions, user.id, user.routeId]);

  const selectedSuggestion = suggestions.find((route) => route.id === selectedRouteId);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId);
  const comparison = useMemo(() => routeComparisonPolicy.compare({ currentRouteGeojson: selectedRoute?.routeGeojson, proposal }), [proposal, selectedRoute?.routeGeojson]);
  const hasLocation = user.latitude != null && user.longitude != null;

  if (!hasLocation) return <section className="waste-assignment-missing-location">
    <div><b>1</b><strong>ต้องระบุตำแหน่งจุดรับขยะก่อน</strong></div>
    <p>ระบบต้องใช้ตำแหน่งบ้านเพื่อค้นหาเส้นทางที่ใกล้ที่สุดและสร้างจุดแวะบนเส้นทางเดินรถ</p>
    <button type="button" className="waste-button waste-button--primary" onClick={onEditLocation}>ระบุตำแหน่งบนแผนที่</button>
  </section>;

  return <section className="waste-assignment-workspace">
    <header><div><small>{user.serviceNo}</small><h3>{user.fullName}</h3><span>บ้านเลขที่ {user.houseNo} · หมู่ {user.villageNo} {user.villageName}</span></div><div className="waste-assignment-location-status"><i />มีตำแหน่งจุดรับขยะแล้ว</div></header>
    <ErrorNotice error={error} />
    {loading && !suggestions.length ? <LoadingState label="กำลังค้นหาเส้นทางใกล้บ้าน" /> : !suggestions.length ? <EmptyState title="ยังไม่มีเส้นทางที่พร้อมแนะนำ" detail="ต้องคำนวณแนวถนนของเส้นทางเก็บขยะก่อน จึงจะเปรียบเทียบระยะห่างจากบ้านได้" /> : <div className="waste-assignment-grid">
      <div className="waste-assignment-route-list"><strong>เลือกเส้นทางรับผิดชอบ</strong>{suggestions.map((route, index) => <button type="button" key={route.id} disabled={saving} className={selectedRouteId === route.id ? "is-selected" : ""} onClick={async () => { setSelectedRouteId(route.id); setProposal(null); const requestId = ++calculationSequence.current; if (route.id !== user.routeId) { const result = await onCalculate(route); if (result && calculationSequence.current === requestId) setProposal(result); } }}><span>{index + 1}</span><div><b>{route.routeCode} · {route.routeName}</b><small>{route.id === user.routeId ? "เส้นทางปัจจุบัน" : `ห่างจากแนวเส้นทางประมาณ ${Number(route.distanceMeters).toLocaleString("th-TH")} เมตร`}</small></div>{route.recommended ? <em>แนะนำ</em> : null}</button>)}</div>
      <div className="waste-assignment-map"><WasteMap previousRouteGeojson={proposal && comparison.hasBaseline ? selectedRoute?.routeGeojson : null} routeGeojson={proposal?.routeGeojson || selectedRoute?.routeGeojson || null} routeStops={proposal?.stops || [{ id: user.id, stopName: `จุดรับขยะ ${user.fullName}`, latitude: user.latitude, longitude: user.longitude, markerRole: "HOME" }]} /><div><i />จุดรับขยะของผู้ใช้บริการ <span>{proposal ? "เทาเส้นเดิม · เขียวเส้นใหม่" : "เส้นสีเขียวคือเส้นทางปัจจุบัน"}</span></div></div>
    </div>}
    {proposal ? <section className="waste-assignment-comparison"><header><div><small>ผลก่อนยืนยัน</small><h3>เส้นทางเดิมเทียบเส้นทางหลังเพิ่มจุดรับขยะ</h3></div><span>{proposal.stops.length.toLocaleString("th-TH")} จุดเก็บ</span></header><div><article><span>ระยะทางเดิม</span><strong>{comparison.hasBaseline ? formatRouteDistance(comparison.currentDistanceMeters) : "ยังไม่มีค่าฐาน"}</strong></article><article><span>ระยะทางใหม่</span><strong>{formatRouteDistance(proposal.distanceMeters)}</strong></article><article><span>เวลาใหม่โดยประมาณ</span><strong>{formatRouteDuration(proposal.durationSeconds)}</strong></article></div><p>ระบบเพิ่มจุดรับขยะนี้เข้ากับจุดเดิม เรียงลำดับใหม่ และคำนวณแนวถนนให้อัตโนมัติ ข้อมูลจริงจะเปลี่ยนเมื่อกดยืนยันเท่านั้น</p></section> : null}
    <footer><div>{selectedSuggestion ? <><span>{proposal ? "พร้อมยืนยัน" : "เส้นทางที่เลือก"}</span><strong>{selectedSuggestion.routeCode} · {selectedSuggestion.routeName}</strong></> : null}</div>{proposal ? <div className="waste-assignment-actions"><button type="button" className="waste-button waste-button--secondary" disabled={saving} onClick={() => setProposal(null)}>เลือกใหม่</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={() => onConfirm(proposal)}>{saving ? "กำลังยืนยัน…" : "ยืนยันการกำหนดเส้นทาง"}</button></div> : <button type="button" className="waste-button waste-button--primary" disabled>{loading || saving ? "กำลังคำนวณเส้นทางใหม่…" : selectedSuggestion?.id === user.routeId ? "ใช้เส้นทางนี้อยู่แล้ว" : "เลือกเส้นทางเพื่อคำนวณ"}</button>}</footer>
  </section>;
}

function ServiceUserForm({ initial, villages, onCancel, onSubmit, saving }) {
  const [location, setLocation] = useState(() => ({
    latitude: initial?.latitude == null ? null : Number(initial.latitude),
    longitude: initial?.longitude == null ? null : Number(initial.longitude),
  }));

  function submit(event) {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSubmit({
      serviceNo: value.serviceNo,
      fullName: value.fullName,
      phone: value.phone,
      houseNo: value.houseNo,
      villageId: Number(value.villageId),
      addressDetail: value.addressDetail || null,
      lineUserId: initial?.lineUserId || null,
      routeId: initial?.routeId || null,
      latitude: location.latitude,
      longitude: location.longitude,
      isActive: value.isActive === "true",
    });
  }

  return <form className="waste-form" onSubmit={submit}>
    <label>เลขผู้ใช้บริการ<input name="serviceNo" required defaultValue={initial?.serviceNo || ""} placeholder="เช่น WU-0001" /></label>
    <label>ชื่อผู้ใช้บริการ<input name="fullName" required defaultValue={initial?.fullName || ""} /></label>
    <label>โทรศัพท์<input name="phone" inputMode="numeric" pattern="0[0-9]{9}" required defaultValue={initial?.phone || ""} /></label>
    <label>บ้านเลขที่<input name="houseNo" required defaultValue={initial?.houseNo || ""} /></label>
    <label>หมู่บ้าน<select name="villageId" required defaultValue={initial?.villageId || ""}><option value="" disabled>เลือกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>หมู่ {village.villageNo} {village.name}</option>)}</select></label>
    <label className="waste-form__wide">รายละเอียดที่อยู่<textarea name="addressDetail" defaultValue={initial?.addressDetail || ""} rows="2" placeholder="ซอย ถนน หรือจุดสังเกต" /></label>
    <div className="waste-form__wide"><LocationPicker latitude={location.latitude} longitude={location.longitude} onChange={setLocation} /></div>
    {initial ? <div className="waste-form__summary"><strong>เส้นทางรับผิดชอบ</strong><p>{initial.routeName ? `ปัจจุบัน: ${initial.routeName}` : "ยังไม่กำหนดเส้นทาง"} · การกำหนดหรือเปลี่ยนเส้นทางทำจากปุ่มในตาราง เพื่อให้ระบบคำนวณรอบวิ่งและแสดงผลเปรียบเทียบก่อนยืนยัน</p></div> : null}
    {initial ? <div className="waste-form__summary"><strong>การเชื่อมบัญชี LINE</strong><p>{initial.lineUserId ? "เชื่อมบัญชีแล้ว ระบบไม่เปิดให้แก้รหัส LINE ด้วยมือ" : "ยังไม่เชื่อมบัญชี ผู้ใช้บริการสามารถเชื่อมผ่านขั้นตอนใน LINE ได้"}</p></div> : null}
    <label>สถานะ<select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">รับบริการอยู่</option><option value="false">ปิดบริการ</option></select></label>
    <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : initial ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้บริการ"}</button></footer>
  </form>;
}

export default function ServiceUsersPage({ token }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [users, setUsers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [assignmentUser, setAssignmentUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState("ALL");
  const [suggestions, setSuggestions] = useState([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextUsers, nextRoutes, nextVillages] = await Promise.all([
        api.get("/api/waste/service-users"),
        api.get("/api/waste/routes"),
        api.get("/api/public/villages"),
      ]);
      setUsers(nextUsers);
      setRoutes(nextRoutes);
      setVillages(nextVillages);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const save = async (input) => {
    setSaving(true);
    setError("");
    try {
      if (modal?.id) await api.patch(`/api/waste/service-users/${modal.id}`, input);
      else await api.post("/api/waste/service-users", input);
      setModal(null);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const openRouteAssignment = async (user) => {
    setAssignmentUser(user);
    setSuggestions([]);
    if (user.latitude == null || user.longitude == null) return;
    setAssignmentLoading(true);
    setError("");
    try {
      setSuggestions(await api.get(`/api/waste/service-users/${user.id}/route-suggestions`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const calculateRouteAssignment = async (route) => {
    if (!assignmentUser?.id && !modal?.id) return;
    const targetUser = assignmentUser || modal;
    setAssignmentLoading(true);
    setError("");
    try {
      return await api.post(`/api/waste/service-users/${targetUser.id}/route-assignment-proposals`, { routeId: route.id });
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setAssignmentLoading(false);
    }
  };

  const confirmRouteAssignment = async (proposal) => {
    if (!assignmentUser?.id && !modal?.id) return;
    const targetUser = assignmentUser || modal;
    setAssignmentLoading(true);
    setError("");
    try {
      await api.post(`/api/waste/service-users/${targetUser.id}/route-assignment-confirmations`, { proposalId: proposal.proposalId });
      setAssignmentUser(null);
      setSuggestions([]);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAssignmentLoading(false);
    }
  };

  const filteredUsers = useMemo(
    () => wasteServiceUserPolicy.filter(users, { routeId: routeFilter, search }),
    [routeFilter, search, users],
  );
  const summary = useMemo(() => wasteServiceUserPolicy.summarize(users), [users]);

  return <>
    <PageHead eyebrow="SERVICE USERS" title="ทะเบียนผู้ใช้บริการเก็บขยะ" detail="จัดการบ้านเรือนหรือสถานที่รับบริการ กำหนดตำแหน่งบนแผนที่ และเชื่อมเข้ากับเส้นทางรับผิดชอบ" actions={<button type="button" className="waste-button waste-button--primary" onClick={() => setModal({})}>+ เพิ่มผู้ใช้บริการ</button>} />
    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-compact-stats" aria-label="สรุปทะเบียนผู้ใช้บริการ">
      <article><span>ผู้ใช้บริการทั้งหมด</span><strong>{formatNumber(summary.total)}</strong><small>ราย</small></article>
      <article className={summary.unassigned ? "is-warning" : ""}><span>ยังไม่กำหนดเส้นทาง</span><strong>{formatNumber(summary.unassigned)}</strong><small>รายที่ต้องดำเนินการ</small>{summary.unassigned ? <button type="button" className="waste-stat-action" onClick={() => setRouteFilter("UNASSIGNED")}>เปิดคิวกำหนดเส้นทาง</button> : null}</article>
      <article><span>เชื่อม LINE แล้ว</span><strong>{formatNumber(summary.linkedToLine)}</strong><small>จาก {formatNumber(summary.total)} ราย</small></article>
    </section>
    <section className="waste-panel">
      <header className="waste-panel__head waste-panel__head--filters">
        <div><p>REGISTERED SERVICE USERS</p><h2>ผู้ใช้บริการทั้งหมด</h2></div>
        <div className="waste-filter-row">
          <label><span className="sr-only">ค้นหาผู้ใช้บริการ</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ เลขผู้ใช้บริการ หรือบ้านเลขที่" /></label>
          <label><span className="sr-only">กรองตามเส้นทาง</span><select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}><option value="ALL">ทุกเส้นทาง</option><option value="UNASSIGNED">ยังไม่กำหนดเส้นทาง</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.routeCode} — {route.routeName}</option>)}</select></label>
        </div>
      </header>
      {loading ? <LoadingState /> : !users.length ? <EmptyState title="ยังไม่มีทะเบียนผู้ใช้บริการ" detail="เพิ่มบ้านเรือนหรือสถานที่เพื่อกำหนดเส้นทางเก็บขยะและออกค่าบริการ" actionLabel="เพิ่มผู้ใช้บริการ" onAction={() => setModal({})} /> : !filteredUsers.length ? <EmptyState title="ไม่พบข้อมูลที่ค้นหา" detail="ลองเปลี่ยนคำค้นหรือเงื่อนไขเส้นทาง" /> : <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th>เลขผู้ใช้บริการ</th><th>ผู้ใช้บริการ / ติดต่อ</th><th>ที่อยู่</th><th>เส้นทาง</th><th>LINE</th><th>สถานะ</th><th /></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id} className={!user.routeId && user.isActive ? "waste-row-needs-action" : ""}><td><strong>{user.serviceNo}</strong></td><td><strong>{user.fullName}</strong><small>{user.phone}</small></td><td>หมู่ {user.villageNo} · {user.houseNo}<small>{user.villageName}{user.latitude != null ? " · มีพิกัด" : " · ยังไม่มีพิกัด"}</small></td><td>{user.routeName ? <><strong>{user.routeName}</strong><button type="button" className="waste-route-assign-link" onClick={() => void openRouteAssignment(user)}>เปลี่ยนเส้นทาง</button></> : <button type="button" className="waste-route-assign-button" onClick={() => void openRouteAssignment(user)}><span>ยังไม่กำหนด</span><strong>{user.latitude == null ? "ระบุตำแหน่งและกำหนดเส้นทาง" : "กำหนดเส้นทาง"}</strong></button>}</td><td>{user.lineUserId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</td><td><StatusBadge value={user.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><button type="button" className="waste-table-action" onClick={() => { setSuggestions([]); setModal(user); }}>แก้ไขข้อมูล</button></td></tr>)}</tbody></table></div>}
    </section>
    {modal ? <Modal title={modal.id ? "แก้ไขผู้ใช้บริการเก็บขยะ" : "เพิ่มผู้ใช้บริการเก็บขยะ"} onClose={() => { setModal(null); setSuggestions([]); }}><ServiceUserForm initial={modal.id ? modal : null} villages={villages} onCancel={() => { setModal(null); setSuggestions([]); }} onSubmit={save} saving={saving} /></Modal> : null}
    {assignmentUser ? <Modal title="กำหนดเส้นทางและคำนวณรอบวิ่ง" onClose={() => { setAssignmentUser(null); setSuggestions([]); }}><RouteAssignmentWorkspace user={assignmentUser} routes={routes} suggestions={suggestions} loading={assignmentLoading} saving={assignmentLoading} error={error} onCalculate={calculateRouteAssignment} onConfirm={confirmRouteAssignment} onEditLocation={() => { setModal(assignmentUser); setAssignmentUser(null); setSuggestions([]); }} /></Modal> : null}
  </>;
}

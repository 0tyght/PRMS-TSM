import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import LocationPicker from "../components/LocationPicker.jsx";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatNumber } from "../components/ui.jsx";
import { wasteServiceUserPolicy } from "../domain/WasteServiceUserPolicy.js";

function ServiceUserForm({ initial, villages, routes, onCancel, onSubmit, saving }) {
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
      routeId: value.routeId || null,
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
    <label>เส้นทางรับผิดชอบ<select name="routeId" defaultValue={initial?.routeId || ""}><option value="">ยังไม่กำหนด</option>{routes.filter((route) => route.isActive).map((route) => <option key={route.id} value={route.id}>{route.routeCode} — {route.routeName}</option>)}</select><small>เมื่อกำหนดเส้นทาง ระบบจะสร้างจุดเก็บให้อัตโนมัติ</small></label>
    <label className="waste-form__wide">รายละเอียดที่อยู่<textarea name="addressDetail" defaultValue={initial?.addressDetail || ""} rows="2" placeholder="ซอย ถนน หรือจุดสังเกต" /></label>
    <div className="waste-form__wide"><LocationPicker latitude={location.latitude} longitude={location.longitude} onChange={setLocation} /></div>
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
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [routeFilter, setRouteFilter] = useState("ALL");

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
      <article className={summary.unassigned ? "is-warning" : ""}><span>ยังไม่กำหนดเส้นทาง</span><strong>{formatNumber(summary.unassigned)}</strong><small>รายที่ต้องดำเนินการ</small></article>
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
      {loading ? <LoadingState /> : !users.length ? <EmptyState title="ยังไม่มีทะเบียนผู้ใช้บริการ" detail="เพิ่มบ้านเรือนหรือสถานที่เพื่อกำหนดเส้นทางเก็บขยะและออกค่าบริการ" actionLabel="เพิ่มผู้ใช้บริการ" onAction={() => setModal({})} /> : !filteredUsers.length ? <EmptyState title="ไม่พบข้อมูลที่ค้นหา" detail="ลองเปลี่ยนคำค้นหรือเงื่อนไขเส้นทาง" /> : <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th>เลขผู้ใช้บริการ</th><th>ผู้ใช้บริการ / ติดต่อ</th><th>ที่อยู่</th><th>เส้นทาง</th><th>LINE</th><th>สถานะ</th><th /></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><strong>{user.serviceNo}</strong></td><td><strong>{user.fullName}</strong><small>{user.phone}</small></td><td>หมู่ {user.villageNo} · {user.houseNo}<small>{user.villageName}{user.latitude != null ? " · มีพิกัด" : " · ยังไม่มีพิกัด"}</small></td><td>{user.routeName || <span className="waste-text-warning">ยังไม่กำหนด</span>}</td><td>{user.lineUserId ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</td><td><StatusBadge value={user.isActive ? "AVAILABLE" : "OUT_OF_SERVICE"} /></td><td><button type="button" className="waste-table-action" onClick={() => setModal(user)}>แก้ไข</button></td></tr>)}</tbody></table></div>}
    </section>
    {modal ? <Modal title={modal.id ? "แก้ไขผู้ใช้บริการเก็บขยะ" : "เพิ่มผู้ใช้บริการเก็บขยะ"} onClose={() => setModal(null)}><ServiceUserForm initial={modal.id ? modal : null} villages={villages} routes={routes} onCancel={() => setModal(null)} onSubmit={save} saving={saving} /></Modal> : null}
  </>;
}

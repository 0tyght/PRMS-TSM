import { useCallback, useEffect, useMemo, useState } from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import { wastePlanFormController } from "../application/WastePlanFormController.js";
import { wastePlanPolicy } from "../domain/WastePlanPolicy.js";
import { EmptyState, ErrorNotice, LoadingState, Modal, PageHead, StatusBadge, formatDate, formatNumber, toDateInput } from "../components/ui.jsx";

function toIso(date, time) { return time ? new Date(`${date}T${time}:00+07:00`).toISOString() : null; }
function toTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(date);
}

const STATUS_CONFIRMATIONS = Object.freeze({
  IN_PROGRESS: { title: "ยืนยันเริ่มปฏิบัติงาน", detail: "รถและคนขับจะเปลี่ยนเป็นกำลังปฏิบัติงาน และเริ่มรับตำแหน่ง GPS ของแผนนี้", action: "เริ่มปฏิบัติงาน" },
  COMPLETED: { title: "ยืนยันปิดแผนงาน", detail: "ควรตรวจว่าจุดเก็บและเหตุระหว่างปฏิบัติงานถูกบันทึกครบแล้ว การปิดแผนไม่สามารถย้อนกลับได้", action: "ยืนยันเสร็จสิ้น" },
  CANCELLED: { title: "ยืนยันยกเลิกแผนงาน", detail: "ยกเลิกได้เฉพาะแผนร่างหรือแผนที่ถอนประกาศแล้ว หากยังต้องปฏิบัติงานให้สร้างแผนใหม่", action: "ยกเลิกแผนงาน" },
});

function PlanForm({ api, resources, date, initial = null, onCancel, onSubmit, saving }) {
  const [scheduledDate, setScheduledDate] = useState(initial?.scheduledDate?.slice?.(0, 10) || date);
  const [routeId, setRouteId] = useState(initial?.routeId || "");
  const initialTimes = { start: toTimeInput(initial?.scheduledStartAt), end: toTimeInput(initial?.scheduledEndAt) };
  const [startTime, setStartTime] = useState(initialTimes.start);
  const [endTime, setEndTime] = useState(initialTimes.end);

  const [vehicleId, setVehicleId] =
    useState(initial?.vehicleId || "");

  const [driverId, setDriverId] =
    useState(initial?.driverId || "");

  const [availability, setAvailability] =
    useState({ vehicles: [], drivers: [] });

  const [availabilityLoading, setAvailabilityLoading] =
    useState(false);

  const [resourceNotice, setResourceNotice] =
    useState("");

  const schedule =
    wastePlanFormController.schedule(
      resources,
      routeId,
      scheduledDate
    );

  const applyOfficialTime = (nextRouteId = routeId, nextDate = scheduledDate) => {
    const range = wastePlanFormController.defaults(resources, nextRouteId, nextDate);
    setStartTime(range.start);
    setEndTime(range.end);
  };
  useEffect(() => {
    if (
      !scheduledDate ||
      !startTime ||
      !endTime
    ) {
      setAvailability({
        vehicles: [],
        drivers: [],
      });

      return undefined;
    }

    let cancelled = false;

    const timer = window.setTimeout(
      async () => {
        setAvailabilityLoading(true);

        try {
          const params =
            new URLSearchParams({
              scheduledDate,
              scheduledStartAt:
                toIso(
                  scheduledDate,
                  startTime
                ),
              scheduledEndAt:
                toIso(
                  scheduledDate,
                  endTime
                ),
            });

          if (initial?.id) {
            params.set(
              "excludePlanId",
              initial.id
            );
          }

          const result =
            await api.get(
              `/api/waste/plans/resource-availability?${params.toString()}`
            );

          if (!cancelled) {
            setAvailability(result);
          }

        } catch (requestError) {
          if (!cancelled) {
            setResourceNotice(
              requestError.message
            );
          }
        } finally {
          if (!cancelled) {
            setAvailabilityLoading(false);
          }
        }
      },
      250
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    api,
    scheduledDate,
    startTime,
    endTime,
    initial?.id,
  ]);

  const vehicleOptions =
    availability.vehicles.length
      ? availability.vehicles
      : resources.vehicles.map(
          (item) => ({
            ...item,
            available: false,
            reason:
              "กำหนดวัน เวลาเริ่ม และเวลาสิ้นสุดก่อนเลือกรถ",
          })
        );

  const driverOptions =
    availability.drivers.length
      ? availability.drivers
      : resources.drivers.map(
          (item) => ({
            ...item,
            available: false,
            reason:
              "กำหนดวัน เวลาเริ่ม และเวลาสิ้นสุดก่อนเลือกคนขับ",
          })
        );

  const submit = (event) => {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSubmit({
      ...(initial?.planNo ? { planNo: initial.planNo } : {}),
      scheduledDate,
      routeId,
      vehicleId,
      driverId,
      scheduledStartAt: toIso(scheduledDate, startTime),
      scheduledEndAt: toIso(scheduledDate, endTime),
      note: value.note || null,
    });
  };

  return <form className="waste-form" onSubmit={submit}>
    <div className="waste-form__summary"><strong>ขั้นที่ 1 · บันทึกแผนร่าง</strong><p>เลือกวัน เส้นทาง รถ และคนขับ ระบบช่วยเติมเวลาจากประกาศของเทศบาลตามวันจริง จากนั้นตรวจสอบก่อนประกาศผ่าน LINE</p></div>
    <label>เลขที่แผนปฏิบัติงาน<input value={initial?.planNo || "ระบบออกเลขให้อัตโนมัติเมื่อบันทึก"} readOnly aria-readonly="true" /></label>
    <label>วันที่ปฏิบัติงาน<input type="date" value={scheduledDate} onChange={(event) => { const value = event.target.value; setScheduledDate(value); window.requestAnimationFrame(() => applyOfficialTime(routeId, value)); }} required /></label>
    <label>
      เส้นทางเก็บขยะ
      <select
        required
        value={routeId}
        onChange={(event) => {
          const value = event.target.value;
          const route = resources.routes.find((item) => item.id === value);

          const status =
            route?.routeGeojson?.properties?.geometryStatus;

          const ready =
            route?.isActive &&
            Number(route.stopCount || 0) >= 2 &&
            route?.routeGeojson?.geometry?.type === "LineString" &&
            status !== "RECALCULATION_REQUIRED";

          if (!ready) {
            setResourceNotice(
              !route?.isActive
                ? "เส้นทางนี้ถูกปิดใช้งาน"
                : Number(route?.stopCount || 0) < 2
                  ? "เส้นทางต้องมีจุดรับบริการอย่างน้อย 2 จุด"
                  : status === "RECALCULATION_REQUIRED"
                    ? "จุดรับบริการเปลี่ยนแปลง กรุณาคำนวณเส้นทางใหม่ก่อน"
                    : "เส้นทางนี้ยังไม่มีแนวถนนที่พร้อมใช้งาน"
            );
            return;
          }

          setResourceNotice("");
          setRouteId(value);
          setVehicleId("");
          setDriverId("");
          applyOfficialTime(value, scheduledDate);
        }}
      >
        <option value="" disabled>
          เลือกเส้นทาง
        </option>

        {resources.routes.map((item) => {
          const status =
            item.routeGeojson?.properties?.geometryStatus;

          const ready =
            item.isActive &&
            Number(item.stopCount || 0) >= 2 &&
            item.routeGeojson?.geometry?.type === "LineString" &&
            status !== "RECALCULATION_REQUIRED";

          return (
            <option
              value={item.id}
              key={item.id}
              style={{
                color: ready
                  ? undefined
                  : "#b42318",
              }}
            >
              {item.routeCode} — {item.routeName} ({formatNumber(item.stopCount)} จุด)
              {ready
                ? ""
                : " — ไม่พร้อมใช้งาน"}
            </option>
          );
        })}
      </select>
    </label>

    <label>
      เวลาเริ่มตามแผน
      <input
        type="time"
        value={startTime}
        onChange={(event) => {
          setStartTime(event.target.value);
          setVehicleId("");
          setDriverId("");
        }}
        required
      />
    </label>

    <label>
      เวลาสิ้นสุดตามแผน
      <input
        type="time"
        value={endTime}
        onChange={(event) => {
          setEndTime(event.target.value);
          setVehicleId("");
          setDriverId("");
        }}
        required
      />
    </label>

    {resourceNotice
      ? <div className="waste-plan-resource-warning">
          <strong>ไม่สามารถเลือกได้</strong>
          <span>{resourceNotice}</span>
        </div>
      : null}

    <label>
      รถเก็บขยะ
      <select
        required
        value={vehicleId}
        disabled={availabilityLoading}
        onChange={(event) => {
          const item =
            vehicleOptions.find(
              (vehicle) =>
                vehicle.id ===
                event.target.value
            );

          if (!item?.available) {
            setResourceNotice(
              `${item?.vehicleCode || "รถคันนี้"}: ${item?.reason || "ไม่พร้อมใช้งาน"}`
            );
            return;
          }

          setResourceNotice("");
          setVehicleId(item.id);
        }}
      >
        <option value="" disabled>
          {availabilityLoading
            ? "กำลังตรวจสอบรถที่ว่าง..."
            : "เลือกรถเก็บขยะ"}
        </option>

        {vehicleOptions.map((item) => (
          <option
            value={item.id}
            key={item.id}
            style={{
              color: item.available
                ? "#176b35"
                : "#b42318",
            }}
          >
            {item.vehicleCode} — {item.registrationNo}
            {" — "}
            {item.available
              ? "ว่าง"
              : item.reason}
          </option>
        ))}
      </select>
    </label>

    <label>
      คนขับรถเก็บขยะ
      <select
        required
        value={driverId}
        disabled={availabilityLoading}
        onChange={(event) => {
          const item =
            driverOptions.find(
              (driver) =>
                driver.id ===
                event.target.value
            );

          if (!item?.available) {
            setResourceNotice(
              `${item?.fullName || "คนขับรายนี้"}: ${item?.reason || "ไม่พร้อมปฏิบัติงาน"}`
            );
            return;
          }

          setResourceNotice("");
          setDriverId(item.id);
        }}
      >
        <option value="" disabled>
          {availabilityLoading
            ? "กำลังตรวจสอบคนขับที่ว่าง..."
            : "เลือกคนขับรถเก็บขยะ"}
        </option>

        {driverOptions.map((item) => (
          <option
            value={item.id}
            key={item.id}
            style={{
              color: item.available
                ? "#176b35"
                : "#b42318",
            }}
          >
            {item.fullName}
            {" — "}
            {item.available
              ? "ว่าง"
              : item.reason}
          </option>
        ))}
      </select>
    </label>
    {schedule ? <div className="waste-form__summary"><strong>{schedule.label} · ตารางตามประกาศ {schedule.time} น.</strong><p>{schedule.areas.join(" · ")}</p></div> : routeId ? <p className="waste-form__hint">ไม่พบตารางตามประกาศสำหรับวันนี้ กรุณาระบุเวลาที่เทศบาลจัดแผนเพิ่มเติมเอง</p> : null}
    <label className="waste-form__wide">หมายเหตุภายใน<textarea name="note" rows="3" defaultValue={initial?.note || ""} placeholder="คำสั่งการหรือรายละเอียดสำหรับเจ้าหน้าที่และคนขับ" /></label>
    <footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>ยกเลิก</button><button className="waste-button waste-button--primary" disabled={saving}>{saving ? "กำลังบันทึก" : initial ? "บันทึกการแก้ไข" : "บันทึกเป็นแผนร่าง"}</button></footer>
  </form>;
}

function PublicationModal({ plan, mode, saving, onCancel, onConfirm }) {
  const readiness = wastePlanPolicy.readiness(plan);
  const [note, setNote] = useState(plan.publicNote || "");
  const [reason, setReason] = useState("");
  if (mode === "withdraw") return <div className="waste-confirmation"><strong>{plan.planNo} · {plan.routeName}</strong><p>ระบบจะถอนตารางจาก LINE และส่งเหตุผลให้ผู้ใช้บริการที่ผูก LINE ในเส้นทางนี้</p><label className="waste-dialog-field">เหตุผลการถอนประกาศ<textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น รถขัดข้อง ต้องจัดรอบใหม่" /></label><footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>กลับไปตรวจสอบ</button><button type="button" className="waste-button waste-button--danger" disabled={saving || reason.trim().length < 4} onClick={() => onConfirm({ reason })}>ถอนประกาศและแจ้ง LINE</button></footer></div>;
  return <div className="waste-confirmation"><strong>{plan.planNo} · {plan.routeName}</strong><p>ขั้นที่ 2 · ตรวจความพร้อมก่อนประกาศ</p><ul className="waste-plan-checks">{readiness.checks.map((check) => <li className={check.ready ? "is-ready" : "is-missing"} key={check.key}><b>{check.ready ? "✓" : "!"}</b><span>{check.label}</span></li>)}</ul><div className="waste-notice-preview"><b>ผู้รับ LINE ในเส้นทางนี้</b><strong>{formatNumber(plan.lineRecipientCount)} ราย</strong><small>ผู้ใช้บริการที่ยังไม่ผูก LINE จะตรวจตารางผ่านเมนูไม่ได้จนกว่าจะเชื่อมบัญชี</small></div><label className="waste-dialog-field">ข้อความเพิ่มเติมถึงประชาชน<textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="ไม่บังคับ เช่น โปรดนำขยะมาวางก่อนเวลา 03:00 น." /></label><footer><button type="button" className="waste-button waste-button--secondary" onClick={onCancel}>กลับไปแก้ไข</button><button type="button" className="waste-button waste-button--primary" disabled={saving || !readiness.ready} onClick={() => onConfirm({ publicNote: note || null })}>ประกาศตารางและส่ง LINE</button></footer></div>;
}

export default function PlansPage({ token, navigate }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [plans, setPlans] = useState([]);

  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [routeFilter, setRouteFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [publicationFilter, setPublicationFilter] = useState("ALL");
  const [resources, setResources] = useState({ vehicles: [], drivers: [], routes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusConfirmation, setStatusConfirmation] = useState(null);
  const [publication, setPublication] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextPlans, vehicles, drivers, routes] = await Promise.all([
        api.get("/api/waste/plans"),
        api.get("/api/waste/vehicles"),
        api.get("/api/waste/drivers"),
        api.get("/api/waste/routes"),
      ]);

      setPlans(nextPlans);
      setResources({ vehicles, drivers, routes });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function run(action) { setSaving(true); setError(""); try { await action(); await load(); } catch (requestError) { setError(requestError.message); } finally { setSaving(false); } }
  async function savePlan(input, current = null) {
    setSaving(true);
    setError("");

    try {
      if (current) {
        await api.patch(`/api/waste/plans/${current.id}`, input);
      } else {
        await api.post("/api/waste/plans", input);
      }

      setEditing(null);
      setCreateOpen(false);

      // รีโหลดรายการทั้งหมด แผนใหม่ต้องเห็นทันที
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id, status) { await run(() => api.patch(`/api/waste/plans/${id}/status`, { status })); }
  async function updatePublication(plan, mode, input) { await run(() => api.post(`/api/waste/plans/${plan.id}/${mode === "publish" ? "publish" : "withdraw"}`, input)); setPublication(null); }

  const filteredPlans = useMemo(() => {
    const today = toDateInput();

    const todayDate = new Date(`${today}T00:00:00+07:00`);

    const weekEnd = new Date(todayDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const monthStart = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      1
    );

    const monthEnd = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth() + 1,
      0
    );

    const normalizedSearch = search.trim().toLowerCase();

    return plans.filter((plan) => {
      const scheduledDate = String(plan.scheduledDate || "").slice(0, 10);
      const planDate = new Date(`${scheduledDate}T00:00:00+07:00`);

      if (dateMode === "TODAY" && scheduledDate !== today) {
        return false;
      }

      if (
        dateMode === "NEXT_7_DAYS" &&
        (
          planDate < todayDate ||
          planDate > weekEnd
        )
      ) {
        return false;
      }

      if (
        dateMode === "THIS_MONTH" &&
        (
          planDate < monthStart ||
          planDate > monthEnd
        )
      ) {
        return false;
      }

      if (dateMode === "CUSTOM") {
        if (customFrom && scheduledDate < customFrom) {
          return false;
        }

        if (customTo && scheduledDate > customTo) {
          return false;
        }
      }

      if (
        routeFilter !== "ALL" &&
        plan.routeId !== routeFilter
      ) {
        return false;
      }

      if (
        statusFilter !== "ALL" &&
        plan.status !== statusFilter
      ) {
        return false;
      }

      if (
        publicationFilter !== "ALL" &&
        plan.publicationStatus !== publicationFilter
      ) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = [
          plan.planNo,
          plan.routeName,
          plan.vehicleCode,
          plan.driverName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [
    plans,
    search,
    dateMode,
    customFrom,
    customTo,
    routeFilter,
    statusFilter,
    publicationFilter,
  ]);

  const clearFilters = () => {
    setSearch("");
    setDateMode("ALL");
    setCustomFrom("");
    setCustomTo("");
    setRouteFilter("ALL");
    setStatusFilter("ALL");
    setPublicationFilter("ALL");
  };

  const hasFilters =
    search ||
    dateMode !== "ALL" ||
    routeFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    publicationFilter !== "ALL";

  return <>
    <PageHead
      eyebrow="OPERATION PLANNING · FR17"
      title="แผนปฏิบัติงานเก็บขยะ"
      detail="ดูแผนทั้งหมดในภาพเดียว แล้วใช้ตัวกรองเพื่อค้นหาช่วงเวลา เส้นทาง สถานะแผน หรือสถานะการประกาศที่ต้องการ"
      actions={
        <button
          type="button"
          className="waste-button waste-button--primary"
          onClick={() => setCreateOpen(true)}
        >
          + สร้างแผนร่าง
        </button>
      }
    />
    <section className="waste-plan-workflow" aria-label="ขั้นตอนจัดแผน"><article><b>1</b><span><strong>จัดแผนร่าง</strong><small>วัน เส้นทาง รถ คนขับ เวลา</small></span></article><article><b>2</b><span><strong>ตรวจความพร้อม</strong><small>ทรัพยากรไม่ซ้ำและเส้นทางพร้อม</small></span></article><article><b>3</b><span><strong>ประกาศผ่าน LINE</strong><small>ส่งเฉพาะผู้ใช้บริการในพื้นที่</small></span></article></section>
    <section className="waste-panel waste-plan-filters">
      <header className="waste-panel__head">
        <div>
          <p>FILTER & SEARCH</p>
          <h2>ค้นหาและกรองแผน</h2>
        </div>

        <div>
          <strong>{formatNumber(filteredPlans.length)}</strong>
          <span> จาก {formatNumber(plans.length)} แผน</span>
        </div>
      </header>

      <div className="waste-filter-row">
        <label>
          <span>ค้นหา</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="เลขแผน เส้นทาง รถ หรือคนขับ"
          />
        </label>

        <label>
          <span>ช่วงเวลา</span>
          <select
            value={dateMode}
            onChange={(event) => setDateMode(event.target.value)}
          >
            <option value="ALL">ทุกช่วงเวลา</option>
            <option value="TODAY">วันนี้</option>
            <option value="NEXT_7_DAYS">7 วันข้างหน้า</option>
            <option value="THIS_MONTH">เดือนนี้</option>
            <option value="CUSTOM">กำหนดเอง</option>
          </select>
        </label>

        <label>
          <span>เส้นทาง</span>
          <select
            value={routeFilter}
            onChange={(event) => setRouteFilter(event.target.value)}
          >
            <option value="ALL">ทุกเส้นทาง</option>
            {resources.routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.routeCode} — {route.routeName}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>สถานะแผน</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="SCHEDULED">ตามแผน</option>
            <option value="IN_PROGRESS">กำลังปฏิบัติงาน</option>
            <option value="INTERRUPTED">หยุดชะงัก</option>
            <option value="COMPLETED">เสร็จสิ้น</option>
            <option value="CANCELLED">ยกเลิก</option>
          </select>
        </label>

        <label>
          <span>การประกาศ</span>
          <select
            value={publicationFilter}
            onChange={(event) => setPublicationFilter(event.target.value)}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="DRAFT">ยังไม่ประกาศ</option>
            <option value="PUBLISHED">ประกาศแล้ว</option>
            <option value="WITHDRAWN">ถอนประกาศแล้ว</option>
          </select>
        </label>

        {hasFilters ? (
          <button
            type="button"
            className="waste-button waste-button--secondary"
            onClick={clearFilters}
          >
            ล้างตัวกรอง
          </button>
        ) : null}
      </div>

      {dateMode === "CUSTOM" ? (
        <div className="waste-filter-row">
          <label>
            <span>ตั้งแต่วันที่</span>
            <input
              type="date"
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </label>

          <label>
            <span>ถึงวันที่</span>
            <input
              type="date"
              min={customFrom || undefined}
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </section>

    <ErrorNotice error={error} onRetry={load} />
    <section className="waste-panel">{loading ? <LoadingState /> : !plans.length ? <EmptyState title="ยังไม่มีแผนปฏิบัติงาน" detail="สร้างแผนร่างจากเส้นทางจริง แล้วตรวจและประกาศตารางก่อนเริ่มงาน" actionLabel="สร้างแผนร่าง" onAction={() => setCreateOpen(true)} /> : !filteredPlans.length ? <EmptyState title="ไม่พบแผนตามตัวกรอง" detail="ลองเปลี่ยนเงื่อนไขการค้นหา หรือล้างตัวกรองเพื่อดูแผนทั้งหมด" actionLabel="ล้างตัวกรอง" onAction={clearFilters} /> : <div className="waste-plan-list">{filteredPlans.map((plan) => <article key={plan.id}>
      <div className="waste-plan-list__date"><strong>{formatDate(plan.scheduledDate, { day: "numeric" })}</strong><span>{formatDate(plan.scheduledDate, { month: "short" })}</span></div>
      <div className="waste-plan-list__main"><header><div><small>{plan.planNo}</small><h2>{plan.routeName}</h2></div><div className="waste-plan-statuses"><span className={`waste-publication waste-publication--${String(plan.publicationStatus || "DRAFT").toLowerCase()}`}>{wastePlanPolicy.publicationLabel(plan.publicationStatus)}</span><StatusBadge value={plan.status} /></div></header><dl><div><dt>รถเก็บขยะ</dt><dd>{plan.vehicleCode}</dd></div><div><dt>คนขับ</dt><dd>{plan.driverName}</dd></div><div><dt>จุดรับบริการ</dt><dd>{formatNumber(plan.stopTotal)} จุด</dd></div><div><dt>เวลา</dt><dd>{plan.scheduledStartAt ? `${formatDate(plan.scheduledStartAt, { hour: "2-digit", minute: "2-digit" })}–${formatDate(plan.scheduledEndAt, { hour: "2-digit", minute: "2-digit" })}` : "ยังไม่ครบ"}</dd></div></dl>{plan.publicationStatus === "PUBLISHED" ? <div className="waste-line-delivery"><span>LINE เป้าหมาย {formatNumber(plan.lineRecipientCount)}</span><span>ส่งแล้ว {formatNumber(plan.lineSentCount)}</span><span>รอส่ง {formatNumber(plan.linePendingCount)}</span>{plan.lineFailedCount ? <span className="is-failed">ไม่สำเร็จ {formatNumber(plan.lineFailedCount)}</span> : null}</div> : null}</div>
      <div className="waste-plan-list__actions">{plan.status === "SCHEDULED" ? <>{plan.publicationStatus !== "PUBLISHED" ? <><button type="button" className="waste-button waste-button--secondary" onClick={() => setEditing(plan)}>แก้ไขแผนร่าง</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={() => setPublication({ plan, mode: "publish" })}>ตรวจและประกาศ</button></> : <><button type="button" className="waste-button waste-button--secondary" onClick={() => setPublication({ plan, mode: "withdraw" })}>ถอนประกาศ</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={() => setStatusConfirmation({ plan, status: "IN_PROGRESS" })}>เริ่มปฏิบัติงาน</button></>}<button type="button" className="waste-button waste-button--quiet" disabled={saving} onClick={() => setStatusConfirmation({ plan, status: "CANCELLED" })}>ยกเลิก</button></> : null}{["IN_PROGRESS", "INTERRUPTED"].includes(plan.status) ? <><button type="button" className="waste-button waste-button--secondary" onClick={() => navigate(`tracking?plan=${plan.id}`)}>ติดตาม</button><button type="button" className="waste-button waste-button--primary" disabled={saving} onClick={() => setStatusConfirmation({ plan, status: "COMPLETED" })}>บันทึกเสร็จสิ้น</button></> : null}</div>
    </article>)}</div>}</section>
    {createOpen ? <Modal title="สร้างแผนปฏิบัติงานเก็บขยะ" onClose={() => setCreateOpen(false)}><PlanForm api={api} resources={resources} date={toDateInput()} onCancel={() => setCreateOpen(false)} onSubmit={(input) => savePlan(input)} saving={saving} /></Modal> : null}
    {editing ? <Modal title="แก้ไขแผนร่าง" onClose={() => setEditing(null)}><PlanForm api={api} resources={resources} date={toDateInput()} initial={editing} onCancel={() => setEditing(null)} onSubmit={(input) => savePlan(input, editing)} saving={saving} /></Modal> : null}
    {publication ? <Modal title={publication.mode === "publish" ? "ตรวจและประกาศตาราง" : "ถอนประกาศตาราง"} onClose={() => setPublication(null)}><PublicationModal {...publication} saving={saving} onCancel={() => setPublication(null)} onConfirm={(input) => updatePublication(publication.plan, publication.mode, input)} /></Modal> : null}
    {statusConfirmation ? <Modal title={STATUS_CONFIRMATIONS[statusConfirmation.status].title} onClose={() => setStatusConfirmation(null)}><div className="waste-confirmation"><strong>{statusConfirmation.plan.planNo} · {statusConfirmation.plan.routeName}</strong><p>{STATUS_CONFIRMATIONS[statusConfirmation.status].detail}</p><footer><button type="button" className="waste-button waste-button--secondary" onClick={() => setStatusConfirmation(null)}>กลับไปตรวจสอบ</button><button type="button" className={statusConfirmation.status === "CANCELLED" ? "waste-button waste-button--danger" : "waste-button waste-button--primary"} disabled={saving} onClick={() => { const { plan, status } = statusConfirmation; setStatusConfirmation(null); void updateStatus(plan.id, status); }}>{STATUS_CONFIRMATIONS[statusConfirmation.status].action}</button></footer></div></Modal> : null}
  </>;
}

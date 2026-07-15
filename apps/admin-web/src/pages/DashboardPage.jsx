import { useEffect, useMemo, useState } from "react";
import DashboardMap from "../components/DashboardMap.jsx";
import { createApi } from "../lib/api.js";
import {
  DASHBOARD_METRICS,
  buildVillageRows,
  getMetricMaximum,
  getMetricValue,
} from "../lib/dashboardVillageData.js";
import "../dashboard-interactive.css";

const initialStats = {
  total: 0,
  dogs: 0,
  cats: 0,
  pending: 0,
  vaccinations: 0,
  sterilizations: 0,
  openCases: 0,
};

const statusLabel = {
  SUBMITTED: ["รอตรวจสอบ", "amber"],
  UNDER_REVIEW: ["กำลังตรวจ", "blue"],
  NEED_MORE_INFO: ["ขอข้อมูลเพิ่ม", "rose"],
  APPROVED: ["อนุมัติแล้ว", "green"],
  REJECTED: ["ไม่อนุมัติ", "gray"],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function coverage(numerator, denominator) {
  const total = toNumber(denominator);
  return total ? Math.round((toNumber(numerator) * 100) / total) : 0;
}

function OverviewStatCard({ metric, active, tone, icon, label, value, suffix = "", detail, onClick }) {
  return (
    <button
      type="button"
      className={`overview-stat-card ${tone} ${active ? "is-active" : ""}`}
      onClick={() => onClick(metric)}
      aria-pressed={active}
    >
      <i>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{Number(value || 0).toLocaleString("th-TH")}{suffix}</strong>
        <em>{detail}</em>
      </span>
      <b>ดูบนแผนที่ →</b>
    </button>
  );
}

function RequestTable({ requests, selectedVillage, onVillageHover, onVillageSelect, onOpenAll }) {
  const rows = requests.slice(0, 7);

  return (
    <div className="overview-table-wrap">
      <table className="overview-table">
        <thead>
          <tr>
            <th>เลขที่คำขอ</th>
            <th>เจ้าของ / สัตว์</th>
            <th>พื้นที่</th>
            <th>สถานะ</th>
            <th>วันที่ยื่น</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => {
              const status = statusLabel[row.status] || [row.status || "-", "gray"];
              const villageNo = Number(row.villageNo);
              return (
                <tr
                  key={row.id || row.referenceNo}
                  className={selectedVillage === villageNo ? "is-selected" : ""}
                  onMouseEnter={() => onVillageHover(villageNo)}
                  onMouseLeave={() => onVillageHover(null)}
                >
                  <td><b>{row.referenceNo || "-"}</b></td>
                  <td>
                    <div className="pet-cell">
                      <i>{row.species === "DOG" ? "ส" : "ม"}</i>
                      <span>
                        <b>{row.petName || "ไม่ระบุชื่อ"}</b>
                        <small>{row.ownerName || "ไม่ระบุเจ้าของ"}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="overview-village-link" onClick={() => onVillageSelect(villageNo)}>
                      หมู่ {villageNo || "-"}
                    </button>
                  </td>
                  <td><span className={`badge ${status[1]}`}>{status[0]}</span></td>
                  <td>
                    {row.submittedAt
                      ? new Date(row.submittedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })
                      : "-"}
                  </td>
                  <td>
                    <button type="button" className="row-action" onClick={onOpenAll} aria-label="เปิดหน้าคำขอขึ้นทะเบียน">
                      ›
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="6">
                <div className="overview-empty-row">ไม่พบคำขอในพื้นที่หรือตัวกรองที่เลือก</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VillageBars({
  rows,
  metric,
  selectedVillage,
  hoveredVillage,
  onVillageSelect,
  onVillageHover,
}) {
  const maximum = getMetricMaximum(rows, metric);
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;

  return (
    <div className="overview-village-chart">
      <div className="overview-village-chart__axis">
        <span>{metricInfo.unit === "%" ? "100%" : maximum.toLocaleString("th-TH")}</span>
        <span>{metricInfo.unit === "%" ? "50%" : Math.round(maximum / 2).toLocaleString("th-TH")}</span>
        <span>0</span>
      </div>
      <div className="overview-village-chart__bars">
        {rows.map((row) => {
          const value = getMetricValue(row, metric);
          const percent = metricInfo.unit === "%" ? value : maximum ? (value / maximum) * 100 : 0;
          const selected = selectedVillage === row.id;
          const hovered = hoveredVillage === row.id;

          return (
            <button
              type="button"
              key={row.id}
              className={`${selected ? "is-selected" : ""} ${hovered ? "is-hovered" : ""}`}
              onClick={() => onVillageSelect(selected ? null : row.id)}
              onMouseEnter={() => onVillageHover(row.id)}
              onMouseLeave={() => onVillageHover(null)}
              onFocus={() => onVillageHover(row.id)}
              onBlur={() => onVillageHover(null)}
              title={`${row.name}: ${value}${metricInfo.unit === "%" ? "%" : ` ${metricInfo.unit}`}`}
            >
              <strong>{metricInfo.unit === "%" ? `${value}%` : value}</strong>
              <i><b style={{ height: `${Math.max(value ? 6 : 0, percent)}%` }} /></i>
              <span>หมู่ {row.id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GuidanceBanner({ selectedRow, stats, onOpenRegistrations, onOpenCases }) {
  const pending = selectedRow ? selectedRow.pending : toNumber(stats.pending);
  const openCases = selectedRow ? selectedRow.openCases : toNumber(stats.openCases);
  const vaccinationCoverage = selectedRow
    ? selectedRow.vaccinationCoverage
    : coverage(stats.vaccinations, stats.total);

  let title = "ข้อมูลภาพรวมพร้อมใช้งาน";
  let detail = "เลือกการ์ดหรือหมู่บ้านเพื่อดูประเด็นที่ต้องติดตามแบบเจาะจง";
  let action = null;

  if (pending > 0) {
    title = `มีคำขอรอตรวจ ${pending} คำขอ`;
    detail = "ควรตรวจสอบข้อมูลเจ้าของและสัตว์ก่อนอนุมัติทะเบียน";
    action = <button type="button" onClick={onOpenRegistrations}>ไปที่คำขอ</button>;
  } else if (openCases > 0) {
    title = `มีเหตุที่ยังไม่ปิดงาน ${openCases} เหตุ`;
    detail = "ตรวจสอบผู้รับผิดชอบและสถานะการดำเนินงานล่าสุด";
    action = <button type="button" onClick={onOpenCases}>ดูเหตุแจ้ง</button>;
  } else if (vaccinationCoverage < 70) {
    title = `ความครอบคลุมวัคซีนอยู่ที่ ${vaccinationCoverage}%`;
    detail = "ควรวางแผนติดตามพื้นที่ที่มีความครอบคลุมต่ำก่อน";
  }

  return (
    <div className="overview-guidance">
      <i>!</i>
      <span>
        <b>{title}</b>
        <small>{detail}</small>
      </span>
      {action}
    </div>
  );
}

export default function DashboardPage({ token, navigate }) {
  const api = useMemo(() => createApi(token), [token]);
  const [stats, setStats] = useState(initialStats);
  const [requests, setRequests] = useState([]);
  const [villages, setVillages] = useState([]);
  const [mapItems, setMapItems] = useState([]);
  const [cases, setCases] = useState([]);
  const [metric, setMetric] = useState("total");
  const [selectedVillage, setSelectedVillage] = useState(null);
  const [hoveredVillage, setHoveredVillage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.allSettled([
      api.get("/api/admin/dashboard"),
      api.get("/api/admin/registrations"),
      api.get("/api/admin/reports/villages"),
      api.get("/api/admin/map"),
      api.get("/api/admin/cases"),
    ]).then((results) => {
      if (!active) return;
      const [dashboardResult, registrationResult, villageResult, mapResult, caseResult] = results;

      setStats(
        dashboardResult.status === "fulfilled" && dashboardResult.value && typeof dashboardResult.value === "object"
          ? dashboardResult.value
          : initialStats,
      );
      setRequests(registrationResult.status === "fulfilled" && Array.isArray(registrationResult.value) ? registrationResult.value : []);
      setVillages(villageResult.status === "fulfilled" && Array.isArray(villageResult.value) ? villageResult.value : []);
      setMapItems(mapResult.status === "fulfilled" && Array.isArray(mapResult.value) ? mapResult.value : []);
      setCases(caseResult.status === "fulfilled" && Array.isArray(caseResult.value) ? caseResult.value : []);
      setLive(results.every((result) => result.status === "fulfilled"));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [api, refreshKey]);

  const villageRows = useMemo(
    () => buildVillageRows({ villages, items: mapItems, requests, cases }),
    [villages, mapItems, requests, cases],
  );
  const selectedRow = villageRows.find((row) => row.id === Number(selectedVillage)) || null;
  const filteredRequests = selectedVillage
    ? requests.filter((row) => Number(row.villageNo) === Number(selectedVillage))
    : requests;

  const total = toNumber(stats.total);
  const vaccinationCoverage = coverage(stats.vaccinations, total);
  const sterilizationCoverage = coverage(stats.sterilizations, total);

  const chooseMetric = (nextMetric) => {
    setMetric(nextMetric);
    window.setTimeout(() => {
      document.getElementById("overview-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <div className="overview-page">
      <section className="overview-hero">
        <div>
          <p className="eyebrow">ภาพรวมและแผนที่ · ปี 2569</p>
          <h1>ศูนย์ข้อมูลสัตว์เลี้ยงเทศบาลท่าโพธ์</h1>
          <p>ดูภาพรวม เลือกหมู่บ้าน และติดตามงานที่ต้องดำเนินการจากหน้าเดียว</p>
        </div>
        <div className="overview-hero__actions">
          <div className={`sync ${live ? "ok" : "demo"}`}>
            <i />
            {loading ? "กำลังโหลดข้อมูล" : live ? "เชื่อมต่อข้อมูลแล้ว" : "ข้อมูลบางส่วนไม่พร้อม"}
          </div>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            ↻ รีเฟรช
          </button>
        </div>
      </section>

      <section className="overview-toolbar" aria-label="ตัวกรองภาพรวม">
        <label>
          <span>พื้นที่</span>
          <select
            value={selectedVillage || ""}
            onChange={(event) => setSelectedVillage(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">ทุกหมู่บ้าน</option>
            {villageRows.map((row) => (
              <option key={row.id} value={row.id}>หมู่ {row.id}</option>
            ))}
          </select>
        </label>
        <label>
          <span>ข้อมูลที่แสดง</span>
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {Object.values(DASHBOARD_METRICS).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <div className="overview-toolbar__selection">
          <span>{selectedRow ? `กำลังดู หมู่ ${selectedRow.id}` : "กำลังดูทุกหมู่บ้าน"}</span>
          {selectedRow ? (
            <button type="button" onClick={() => setSelectedVillage(null)}>ล้างตัวกรอง</button>
          ) : null}
        </div>
      </section>

      <GuidanceBanner
        selectedRow={selectedRow}
        stats={stats}
        onOpenRegistrations={() => navigate("registrations")}
        onOpenCases={() => navigate("cases")}
      />

      <section className="overview-stats">
        <OverviewStatCard
          metric="total"
          active={metric === "total"}
          tone="green"
          icon="●"
          label="สัตว์ขึ้นทะเบียน"
          value={selectedRow ? selectedRow.totalPets : stats.total}
          detail={selectedRow
            ? `สุนัข ${selectedRow.dogs} · แมว ${selectedRow.cats}`
            : `สุนัข ${stats.dogs || 0} · แมว ${stats.cats || 0}`}
          onClick={chooseMetric}
        />
        <OverviewStatCard
          metric="vaccination"
          active={metric === "vaccination"}
          tone="blue"
          icon="+"
          label="ความครอบคลุมวัคซีน"
          value={selectedRow ? selectedRow.vaccinationCoverage : vaccinationCoverage}
          suffix="%"
          detail={`${selectedRow ? selectedRow.vaccinated : stats.vaccinations || 0} ตัวมีประวัติวัคซีน`}
          onClick={chooseMetric}
        />
        <OverviewStatCard
          metric="sterilization"
          active={metric === "sterilization"}
          tone="violet"
          icon="◇"
          label="ความครอบคลุมทำหมัน"
          value={selectedRow ? selectedRow.sterilizationCoverage : sterilizationCoverage}
          suffix="%"
          detail={`${selectedRow ? selectedRow.sterilized : stats.sterilizations || 0} ตัวทำหมันแล้ว`}
          onClick={chooseMetric}
        />
        <OverviewStatCard
          metric="pending"
          active={metric === "pending"}
          tone="amber"
          icon="⌁"
          label="คำขอรอตรวจ"
          value={selectedRow ? selectedRow.pending : stats.pending}
          detail="ควรตรวจภายใน 3 วันทำการ"
          onClick={chooseMetric}
        />
        <OverviewStatCard
          metric="cases"
          active={metric === "cases"}
          tone="rose"
          icon="!"
          label="เหตุที่กำลังดำเนินการ"
          value={selectedRow ? selectedRow.openCases : stats.openCases}
          detail="ติดตามจนกว่าจะปิดงาน"
          onClick={chooseMetric}
        />
      </section>

      <div id="overview-map">
        <DashboardMap
          items={mapItems}
          villages={villages}
          requests={requests}
          cases={cases}
          metric={metric}
          selectedVillage={selectedVillage}
          hoveredVillage={hoveredVillage}
          onMetricChange={setMetric}
          onVillageSelect={setSelectedVillage}
          onVillageHover={setHoveredVillage}
          onOpenPets={() => navigate("pets")}
          onOpenRegistrations={() => navigate("registrations")}
          onOpenCases={() => navigate("cases")}
        />
      </div>

      <section className="overview-bottom-grid">
        <article className="panel overview-requests">
          <div className="panel-head">
            <div>
              <h2>{selectedRow ? `คำขอในหมู่ ${selectedRow.id}` : "คำขอล่าสุด"}</h2>
              <p>เลื่อนเมาส์เหนือรายการเพื่อเชื่อมโยงกับแผนที่</p>
            </div>
            <button className="text-btn" type="button" onClick={() => navigate("registrations")}>ดูทั้งหมด →</button>
          </div>
          <RequestTable
            requests={filteredRequests}
            selectedVillage={selectedVillage}
            onVillageHover={setHoveredVillage}
            onVillageSelect={setSelectedVillage}
            onOpenAll={() => navigate("registrations")}
          />
        </article>

        <article className="panel overview-village-panel">
          <div className="panel-head">
            <div>
              <h2>เปรียบเทียบรายหมู่บ้าน</h2>
              <p>{DASHBOARD_METRICS[metric]?.label}</p>
            </div>
            <button className="text-btn" type="button" onClick={() => navigate("reports")}>ดูรายงาน →</button>
          </div>
          <VillageBars
            rows={villageRows}
            metric={metric}
            selectedVillage={selectedVillage}
            hoveredVillage={hoveredVillage}
            onVillageSelect={setSelectedVillage}
            onVillageHover={setHoveredVillage}
          />
        </article>
      </section>
    </div>
  );
}

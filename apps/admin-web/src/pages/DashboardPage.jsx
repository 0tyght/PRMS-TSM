import { useEffect, useMemo, useState } from "react";
import DashboardMap from "../components/DashboardMap.jsx";
import { createApi } from "../lib/api.js";
import {
  DASHBOARD_METRICS,
  buildVillageRows,
  getMetricValue,
  summarizeVillageRows,
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
  SUBMITTED: ["รอตรวจ", "amber"],
  UNDER_REVIEW: ["กำลังตรวจ", "blue"],
  NEED_MORE_INFO: ["ขอข้อมูล", "rose"],
  APPROVED: ["อนุมัติ", "green"],
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

function CompactKpi({ metric, active, icon, label, value, suffix = "", detail, tone, onSelect }) {
  return (
    <button
      type="button"
      className={`compact-kpi ${tone} ${active ? "is-active" : ""}`}
      onClick={() => onSelect(metric)}
      aria-pressed={active}
      title={`แสดง${label}บนแผนที่`}
    >
      <i>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{Number(value || 0).toLocaleString("th-TH")}{suffix}</strong>
        <em>{detail}</em>
      </span>
    </button>
  );
}

function ProgressLine({ label, value, tone }) {
  return (
    <div className="compact-progress">
      <div><span>{label}</span><b>{value}%</b></div>
      <i><b className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i>
    </div>
  );
}

function buildGuidance(row) {
  const items = [];

  if (row.pending > 0) {
    items.push({ tone: "amber", title: `คำขอรอตรวจ ${row.pending} คำขอ`, detail: "ตรวจสอบข้อมูลก่อนอนุมัติ", target: "registrations" });
  }
  if (row.openCases > 0) {
    items.push({ tone: "rose", title: `เหตุยังไม่ปิด ${row.openCases} เหตุ`, detail: "ติดตามผู้รับผิดชอบและสถานะ", target: "cases" });
  }
  if (row.totalPets > 0 && row.vaccinationCoverage < 70) {
    items.push({ tone: "amber", title: `วัคซีนครอบคลุม ${row.vaccinationCoverage}%`, detail: `ควรติดตามอีก ${Math.max(0, row.totalPets - row.vaccinated)} ตัว`, target: "services" });
  }
  if (row.totalPets > 0 && row.sterilizationCoverage < 50) {
    items.push({ tone: "violet", title: `ทำหมันครอบคลุม ${row.sterilizationCoverage}%`, detail: `ยังไม่มีประวัติ ${Math.max(0, row.totalPets - row.sterilized)} ตัว`, target: "services" });
  }

  if (!items.length) {
    items.push({ tone: "green", title: "พื้นที่อยู่ในเกณฑ์ดี", detail: "ยังไม่มีรายการเร่งด่วนจากข้อมูลปัจจุบัน", target: "reports" });
  }

  return items.slice(0, 4);
}

function OverviewSummary({ row, selected, onClear }) {
  return (
    <section className="compact-side-summary">
      <div className="compact-side-summary__head">
        <div>
          <small>{selected ? "พื้นที่ที่เลือก" : "ภาพรวมเทศบาล"}</small>
          <h2>{selected ? row.name : "ทุกหมู่บ้าน"}</h2>
        </div>
        {selected ? <button type="button" onClick={onClear}>ล้าง</button> : null}
      </div>

      <div className="compact-side-summary__numbers">
        <div><span>สัตว์ทั้งหมด</span><strong>{row.totalPets.toLocaleString("th-TH")}</strong></div>
        <div><span>สุนัข</span><strong>{row.dogs.toLocaleString("th-TH")}</strong></div>
        <div><span>แมว</span><strong>{row.cats.toLocaleString("th-TH")}</strong></div>
      </div>

      <ProgressLine label="วัคซีน" value={row.vaccinationCoverage} tone="green" />
      <ProgressLine label="ทำหมัน" value={row.sterilizationCoverage} tone="violet" />
    </section>
  );
}

function TaskPanel({ row, navigate }) {
  const guidance = buildGuidance(row);

  return (
    <div className="compact-task-list">
      {guidance.map((item) => (
        <button type="button" key={`${item.title}-${item.target}`} onClick={() => navigate(item.target)}>
          <i className={item.tone}>!</i>
          <span><b>{item.title}</b><small>{item.detail}</small></span>
          <em>›</em>
        </button>
      ))}
    </div>
  );
}

function RequestPanel({ requests, selectedVillage, onVillageHover, onVillageSelect, navigate }) {
  const rows = requests.slice(0, 6);

  if (!rows.length) {
    return <div className="compact-empty">ไม่พบคำขอในพื้นที่ที่เลือก</div>;
  }

  return (
    <div className="compact-request-list">
      {rows.map((row) => {
        const villageNo = Number(row.villageNo);
        const status = statusLabel[row.status] || [row.status || "-", "gray"];
        return (
          <button
            type="button"
            key={row.id || row.referenceNo}
            className={Number(selectedVillage) === villageNo ? "is-selected" : ""}
            onMouseEnter={() => onVillageHover(villageNo)}
            onMouseLeave={() => onVillageHover(null)}
            onFocus={() => onVillageHover(villageNo)}
            onBlur={() => onVillageHover(null)}
            onClick={() => {
              onVillageSelect(villageNo || null);
              navigate("registrations");
            }}
          >
            <i>{row.species === "DOG" ? "ส" : "ม"}</i>
            <span>
              <b>{row.petName || "ไม่ระบุชื่อ"}</b>
              <small>{row.ownerName || row.referenceNo || "ไม่ระบุเจ้าของ"}</small>
            </span>
            <em>หมู่ {villageNo || "-"}</em>
            <strong className={status[1]}>{status[0]}</strong>
          </button>
        );
      })}
    </div>
  );
}

function VillagePanel({ rows, metric, selectedVillage, onVillageHover, onVillageSelect }) {
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;
  const sortedRows = [...rows].sort((a, b) => {
    if (metric === "vaccination" || metric === "sterilization") {
      return getMetricValue(a, metric) - getMetricValue(b, metric);
    }
    return getMetricValue(b, metric) - getMetricValue(a, metric);
  });

  return (
    <div className="compact-village-list">
      {sortedRows.map((row) => {
        const value = getMetricValue(row, metric);
        const width = metricInfo.unit === "%"
          ? value
          : Math.max(4, Math.round((value / Math.max(1, ...rows.map((item) => getMetricValue(item, metric)))) * 100));
        return (
          <button
            type="button"
            key={row.id}
            className={Number(selectedVillage) === row.id ? "is-selected" : ""}
            onMouseEnter={() => onVillageHover(row.id)}
            onMouseLeave={() => onVillageHover(null)}
            onFocus={() => onVillageHover(row.id)}
            onBlur={() => onVillageHover(null)}
            onClick={() => onVillageSelect(Number(selectedVillage) === row.id ? null : row.id)}
          >
            <span>หมู่ {row.id}</span>
            <i><b style={{ width: `${width}%` }} /></i>
            <strong>{metricInfo.unit === "%" ? `${value}%` : value}</strong>
          </button>
        );
      })}
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
  const [sideTab, setSideTab] = useState("tasks");
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
  const summary = useMemo(() => summarizeVillageRows(villageRows), [villageRows]);
  const selectedRow = villageRows.find((row) => row.id === Number(selectedVillage)) || null;
  const currentRow = selectedRow || summary;
  const filteredRequests = selectedVillage
    ? requests.filter((row) => Number(row.villageNo) === Number(selectedVillage))
    : requests;

  const total = toNumber(stats.total) || summary.totalPets;
  const dogs = toNumber(stats.dogs) || summary.dogs;
  const cats = toNumber(stats.cats) || summary.cats;
  const vaccinationCoverage = coverage(toNumber(stats.vaccinations) || summary.vaccinated, total);
  const sterilizationCoverage = coverage(toNumber(stats.sterilizations) || summary.sterilized, total);
  const pending = toNumber(stats.pending) || summary.pending;
  const openCases = toNumber(stats.openCases) || summary.openCases;

  const chooseMetric = (nextMetric) => setMetric(nextMetric);

  return (
    <main className="dashboard-compact">
      <header className="dashboard-compact__header">
        <div>
          <span>ระบบทะเบียนและติดตามสัตว์เลี้ยง · ปี 2569</span>
          <h1>ภาพรวมและแผนที่</h1>
        </div>

        <div className="dashboard-compact__tools">
          <label>
            <span>พื้นที่</span>
            <select
              value={selectedVillage || ""}
              onChange={(event) => setSelectedVillage(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">ทุกหมู่บ้าน</option>
              {villageRows.map((row) => <option key={row.id} value={row.id}>หมู่ {row.id}</option>)}
            </select>
          </label>
          <div className={`dashboard-sync ${live ? "is-live" : "is-warning"}`}>
            <i />{loading ? "กำลังโหลด" : live ? "ข้อมูลพร้อม" : "ข้อมูลบางส่วนไม่พร้อม"}
          </div>
          <button type="button" className="dashboard-refresh" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            ↻ <span>รีเฟรช</span>
          </button>
        </div>
      </header>

      <section className="compact-kpi-strip" aria-label="ตัวชี้วัดภาพรวม">
        <CompactKpi metric="total" active={metric === "total"} tone="green" icon="●" label="สัตว์ขึ้นทะเบียน" value={total} detail={`สุนัข ${dogs} · แมว ${cats}`} onSelect={chooseMetric} />
        <CompactKpi metric="vaccination" active={metric === "vaccination"} tone="teal" icon="+" label="วัคซีน" value={vaccinationCoverage} suffix="%" detail={`${toNumber(stats.vaccinations) || summary.vaccinated} ตัวมีประวัติ`} onSelect={chooseMetric} />
        <CompactKpi metric="sterilization" active={metric === "sterilization"} tone="violet" icon="◇" label="ทำหมัน" value={sterilizationCoverage} suffix="%" detail={`${toNumber(stats.sterilizations) || summary.sterilized} ตัวมีประวัติ`} onSelect={chooseMetric} />
        <CompactKpi metric="pending" active={metric === "pending"} tone="amber" icon="⌁" label="คำขอรอตรวจ" value={pending} detail="คลิกเพื่อดูพื้นที่ค้างงาน" onSelect={chooseMetric} />
        <CompactKpi metric="cases" active={metric === "cases"} tone="rose" icon="!" label="เหตุที่ดำเนินการ" value={openCases} detail="เหตุที่ยังไม่ปิดงาน" onSelect={chooseMetric} />
      </section>

      <section className="dashboard-workspace">
        <DashboardMap
          rows={villageRows}
          metric={metric}
          selectedVillage={selectedVillage}
          hoveredVillage={hoveredVillage}
          onMetricChange={setMetric}
          onVillageSelect={setSelectedVillage}
          onVillageHover={setHoveredVillage}
        />

        <aside className="compact-side-panel">
          <OverviewSummary row={currentRow} selected={Boolean(selectedRow)} onClear={() => setSelectedVillage(null)} />

          <nav className="compact-side-tabs" aria-label="ข้อมูลประกอบแผนที่">
            <button type="button" className={sideTab === "tasks" ? "is-active" : ""} onClick={() => setSideTab("tasks")}>ต้องดำเนินการ</button>
            <button type="button" className={sideTab === "requests" ? "is-active" : ""} onClick={() => setSideTab("requests")}>คำขอล่าสุด</button>
            <button type="button" className={sideTab === "villages" ? "is-active" : ""} onClick={() => setSideTab("villages")}>เทียบ 11 หมู่</button>
          </nav>

          <div className="compact-side-content">
            {sideTab === "tasks" ? <TaskPanel row={currentRow} navigate={navigate} /> : null}
            {sideTab === "requests" ? (
              <RequestPanel
                requests={filteredRequests}
                selectedVillage={selectedVillage}
                onVillageHover={setHoveredVillage}
                onVillageSelect={setSelectedVillage}
                navigate={navigate}
              />
            ) : null}
            {sideTab === "villages" ? (
              <VillagePanel
                rows={villageRows}
                metric={metric}
                selectedVillage={selectedVillage}
                onVillageHover={setHoveredVillage}
                onVillageSelect={setSelectedVillage}
              />
            ) : null}
          </div>

          <footer className="compact-side-actions">
            <button type="button" onClick={() => navigate("pets")}>ทะเบียนสัตว์</button>
            <button type="button" className="primary" onClick={() => navigate("registrations")}>จัดการคำขอ</button>
          </footer>
        </aside>
      </section>
    </main>
  );
}

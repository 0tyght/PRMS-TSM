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

function hasCoordinate(item) {
  const latitude = toNumber(item?.latitude);
  const longitude = toNumber(item?.longitude);
  return latitude !== 0 && longitude !== 0 && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function KpiCard({ metric, active, icon, label, value, suffix = "", detail, tone, onSelect }) {
  return (
    <button
      type="button"
      className={`dashboard-kpi dashboard-kpi--${tone} ${active ? "is-active" : ""}`}
      onClick={() => onSelect(metric)}
      aria-pressed={active}
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

function ProgressLine({ label, value, numerator, denominator, tone }) {
  return (
    <div className="dashboard-progress">
      <div>
        <span>{label}</span>
        <b>{value}% <small>{numerator}/{denominator} ตัว</small></b>
      </div>
      <i><b className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i>
    </div>
  );
}

function buildGuidance(row, missingCoordinates) {
  const items = [];

  if (row.pending > 0) {
    items.push({ tone: "amber", icon: "1", title: `ตรวจคำขอค้าง ${row.pending} คำขอ`, detail: "ตรวจข้อมูลเจ้าของ สัตว์ และตำแหน่งก่อนอนุมัติ", target: "registrations" });
  }
  if (row.openCases > 0) {
    items.push({ tone: "rose", icon: "!", title: `ติดตามเหตุยังไม่ปิด ${row.openCases} เหตุ`, detail: "ตรวจผู้รับผิดชอบและกำหนดวันติดตาม", target: "cases" });
  }
  if (row.totalPets > 0 && row.vaccinationCoverage < 70) {
    items.push({ tone: "amber", icon: "+", title: `วัคซีนครอบคลุมเพียง ${row.vaccinationCoverage}%`, detail: `ยังไม่มีประวัติภายใน 1 ปี ${Math.max(0, row.totalPets - row.vaccinated)} ตัว`, target: "services" });
  }
  if (row.totalPets > 0 && row.sterilizationCoverage < 50) {
    items.push({ tone: "violet", icon: "◇", title: `ทำหมันครอบคลุม ${row.sterilizationCoverage}%`, detail: `ยังไม่มีประวัติทำหมัน ${Math.max(0, row.totalPets - row.sterilized)} ตัว`, target: "services" });
  }
  if (missingCoordinates > 0) {
    items.push({ tone: "blue", icon: "⌖", title: `ข้อมูลขาดพิกัด ${missingCoordinates} ตัว`, detail: "ควรบันทึกตำแหน่งบ้านเพื่อใช้วางแผนลงพื้นที่", target: "pets" });
  }

  if (!items.length) {
    items.push({ tone: "green", icon: "✓", title: "ข้อมูลพื้นที่อยู่ในเกณฑ์พร้อมใช้งาน", detail: "ยังไม่มีงานเร่งด่วนจากเงื่อนไขปัจจุบัน", target: "reports" });
  }

  return items.slice(0, 5);
}

function AreaSummary({ row, selected, missingCoordinates, onClear }) {
  return (
    <section className="dashboard-area-summary">
      <div className="dashboard-area-summary__head">
        <div>
          <small>{selected ? "พื้นที่ที่เลือก" : "ภาพรวมเทศบาล"}</small>
          <h2>{selected ? row.villageName || row.name : "ตำบลท่าโพธ์ · 11 หมู่"}</h2>
        </div>
        {selected ? <button type="button" onClick={onClear}>แสดงทุกหมู่</button> : null}
      </div>

      <div className="dashboard-area-summary__numbers">
        <div><span>สัตว์ทั้งหมด</span><strong>{row.totalPets.toLocaleString("th-TH")}</strong><small>ตัว</small></div>
        <div><span>สุนัข</span><strong>{row.dogs.toLocaleString("th-TH")}</strong><small>ตัว</small></div>
        <div><span>แมว</span><strong>{row.cats.toLocaleString("th-TH")}</strong><small>ตัว</small></div>
      </div>

      <ProgressLine label="ความครอบคลุมวัคซีน" value={row.vaccinationCoverage} numerator={row.vaccinated} denominator={row.totalPets} tone="green" />
      <ProgressLine label="ความครอบคลุมทำหมัน" value={row.sterilizationCoverage} numerator={row.sterilized} denominator={row.totalPets} tone="violet" />

      <div className="dashboard-data-quality">
        <span><i className={missingCoordinates ? "warning" : "good"} />ความพร้อมข้อมูลพิกัด</span>
        <b>{missingCoordinates ? `ขาด ${missingCoordinates} ตัว` : "ครบถ้วน"}</b>
      </div>
    </section>
  );
}

function TaskPanel({ row, missingCoordinates, navigate }) {
  const guidance = buildGuidance(row, missingCoordinates);
  return (
    <div className="dashboard-task-list">
      {guidance.map((item) => (
        <button type="button" key={`${item.title}-${item.target}`} onClick={() => navigate(item.target)}>
          <i className={item.tone}>{item.icon}</i>
          <span><b>{item.title}</b><small>{item.detail}</small></span>
          <em>›</em>
        </button>
      ))}
    </div>
  );
}

function RequestPanel({ requests, selectedVillage, onVillageHover, onVillageSelect, navigate }) {
  const rows = requests.slice(0, 7);
  if (!rows.length) return <div className="dashboard-empty">ไม่พบคำขอในพื้นที่ที่เลือก</div>;

  return (
    <div className="dashboard-request-list">
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
            <span><b>{row.petName || "ไม่ระบุชื่อสัตว์"}</b><small>{row.ownerName || row.referenceNo || "ไม่ระบุเจ้าของ"}</small></span>
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
  const maximum = Math.max(1, ...rows.map((item) => getMetricValue(item, metric)));
  const sortedRows = [...rows].sort((a, b) => {
    if (metric === "vaccination" || metric === "sterilization") return getMetricValue(a, metric) - getMetricValue(b, metric);
    return getMetricValue(b, metric) - getMetricValue(a, metric);
  });

  return (
    <div className="dashboard-village-list">
      {sortedRows.map((row) => {
        const value = getMetricValue(row, metric);
        const width = metricInfo.unit === "%" ? value : Math.max(3, Math.round((value / maximum) * 100));
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
            <span><b>หมู่ {row.id}</b><small>{row.villageName || row.name}</small></span>
            <i><b style={{ width: `${width}%` }} /></i>
            <strong>{metricInfo.unit === "%" ? `${value}%` : value.toLocaleString("th-TH")}</strong>
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

      setStats(dashboardResult.status === "fulfilled" && dashboardResult.value && typeof dashboardResult.value === "object" ? dashboardResult.value : initialStats);
      setRequests(registrationResult.status === "fulfilled" && Array.isArray(registrationResult.value) ? registrationResult.value : []);
      setVillages(villageResult.status === "fulfilled" && Array.isArray(villageResult.value) ? villageResult.value : []);
      setMapItems(mapResult.status === "fulfilled" && Array.isArray(mapResult.value) ? mapResult.value : []);
      setCases(caseResult.status === "fulfilled" && Array.isArray(caseResult.value) ? caseResult.value : []);
      setLive(results.every((result) => result.status === "fulfilled"));
      setLoading(false);
    });

    return () => { active = false; };
  }, [api, refreshKey]);

  const villageRows = useMemo(() => buildVillageRows({ villages, items: mapItems, requests, cases }), [villages, mapItems, requests, cases]);
  const summary = useMemo(() => summarizeVillageRows(villageRows), [villageRows]);
  const selectedRow = villageRows.find((row) => row.id === Number(selectedVillage)) || null;
  const currentRow = selectedRow || summary;
  const selectedItems = selectedVillage ? mapItems.filter((item) => Number(item.villageNo) === Number(selectedVillage)) : mapItems;
  const selectedPetsWithCoordinates = selectedItems.filter(hasCoordinate).length;
  const missingCoordinates = Math.max(0, currentRow.totalPets - selectedPetsWithCoordinates);
  const filteredRequests = selectedVillage ? requests.filter((row) => Number(row.villageNo) === Number(selectedVillage)) : requests;

  const total = toNumber(stats.total) || summary.totalPets;
  const dogs = toNumber(stats.dogs) || summary.dogs;
  const cats = toNumber(stats.cats) || summary.cats;
  const vaccinationCount = toNumber(stats.vaccinations) || summary.vaccinated;
  const sterilizationCount = toNumber(stats.sterilizations) || summary.sterilized;
  const vaccinationCoverage = coverage(vaccinationCount, total);
  const sterilizationCoverage = coverage(sterilizationCount, total);
  const pending = toNumber(stats.pending) || summary.pending;
  const openCases = toNumber(stats.openCases) || summary.openCases;

  return (
    <main className="dashboard-smart">
      <header className="dashboard-smart__header">
        <div>
          <span>ระบบทะเบียนและติดตามสัตว์เลี้ยง · ข้อมูลปี 2569</span>
          <h1>ภาพรวมและแผนที่</h1>
          <p>ดูสถานการณ์ทั้งตำบล เลือกหมู่บ้าน และตรวจงานที่ต้องดำเนินการจากหน้าเดียว</p>
        </div>

        <div className="dashboard-smart__tools">
          <label>
            <span>เลือกพื้นที่</span>
            <select value={selectedVillage || ""} onChange={(event) => setSelectedVillage(event.target.value ? Number(event.target.value) : null)}>
              <option value="">ทุกหมู่บ้าน</option>
              {villageRows.map((row) => <option key={row.id} value={row.id}>หมู่ {row.id} · {row.villageName || row.name}</option>)}
            </select>
          </label>
          <div className={`dashboard-sync ${live ? "is-live" : "is-warning"}`}><i />{loading ? "กำลังโหลดข้อมูล" : live ? "ข้อมูลล่าสุดพร้อมใช้งาน" : "ข้อมูลบางส่วนไม่พร้อม"}</div>
          <button type="button" className="dashboard-refresh" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>↻ <span>รีเฟรช</span></button>
        </div>
      </header>

      <section className="dashboard-kpi-row" aria-label="ตัวชี้วัดภาพรวม">
        <KpiCard metric="total" active={metric === "total"} tone="green" icon="●" label="สัตว์ขึ้นทะเบียน" value={total} detail={`สุนัข ${dogs} · แมว ${cats}`} onSelect={setMetric} />
        <KpiCard metric="vaccination" active={metric === "vaccination"} tone="teal" icon="+" label="ความครอบคลุมวัคซีน" value={vaccinationCoverage} suffix="%" detail={`${vaccinationCount} จาก ${total} ตัว`} onSelect={setMetric} />
        <KpiCard metric="sterilization" active={metric === "sterilization"} tone="violet" icon="◇" label="ความครอบคลุมทำหมัน" value={sterilizationCoverage} suffix="%" detail={`${sterilizationCount} จาก ${total} ตัว`} onSelect={setMetric} />
        <KpiCard metric="pending" active={metric === "pending"} tone="amber" icon="⌁" label="คำขอรอตรวจ" value={pending} detail="กดเพื่อดูพื้นที่ที่มีงานค้าง" onSelect={setMetric} />
        <KpiCard metric="cases" active={metric === "cases"} tone="rose" icon="!" label="เหตุที่ยังดำเนินการ" value={openCases} detail="เหตุแจ้งที่ยังไม่ปิดงาน" onSelect={setMetric} />
      </section>

      <section className="dashboard-smart__workspace">
        <DashboardMap
          rows={villageRows}
          metric={metric}
          selectedVillage={selectedVillage}
          hoveredVillage={hoveredVillage}
          onMetricChange={setMetric}
          onVillageSelect={setSelectedVillage}
          onVillageHover={setHoveredVillage}
        />

        <aside className="dashboard-side-panel">
          <AreaSummary row={currentRow} selected={Boolean(selectedRow)} missingCoordinates={missingCoordinates} onClear={() => setSelectedVillage(null)} />

          <nav className="dashboard-side-tabs" aria-label="ข้อมูลประกอบแผนที่">
            <button type="button" className={sideTab === "tasks" ? "is-active" : ""} onClick={() => setSideTab("tasks")}><span>ต้องดำเนินการ</span><b>{buildGuidance(currentRow, missingCoordinates).length}</b></button>
            <button type="button" className={sideTab === "requests" ? "is-active" : ""} onClick={() => setSideTab("requests")}><span>คำขอล่าสุด</span><b>{filteredRequests.length}</b></button>
            <button type="button" className={sideTab === "villages" ? "is-active" : ""} onClick={() => setSideTab("villages")}><span>เปรียบเทียบ 11 หมู่</span></button>
          </nav>

          <div className="dashboard-side-content">
            {sideTab === "tasks" ? <TaskPanel row={currentRow} missingCoordinates={missingCoordinates} navigate={navigate} /> : null}
            {sideTab === "requests" ? <RequestPanel requests={filteredRequests} selectedVillage={selectedVillage} onVillageHover={setHoveredVillage} onVillageSelect={setSelectedVillage} navigate={navigate} /> : null}
            {sideTab === "villages" ? <VillagePanel rows={villageRows} metric={metric} selectedVillage={selectedVillage} onVillageHover={setHoveredVillage} onVillageSelect={setSelectedVillage} /> : null}
          </div>

          <footer className="dashboard-side-actions">
            <button type="button" onClick={() => navigate("pets")}>เปิดทะเบียนสัตว์</button>
            <button type="button" className="primary" onClick={() => navigate("registrations")}>จัดการคำขอ</button>
          </footer>
        </aside>
      </section>
    </main>
  );
}

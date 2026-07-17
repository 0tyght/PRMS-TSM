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

const requestStatus = {
  SUBMITTED: ["รอตรวจ", "amber"],
  UNDER_REVIEW: ["กำลังตรวจ", "blue"],
  NEED_MORE_INFO: ["ขอข้อมูลเพิ่ม", "rose"],
  APPROVED: ["อนุมัติแล้ว", "green"],
  REJECTED: ["ไม่อนุมัติ", "gray"],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(value) {
  if (!value) return "ยังไม่อัปเดต";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function Icon({ name }) {
  const paths = {
    pets: <><path d="M7.5 12.5c-2.4 0-4.5 1.7-4.5 4 0 2 1.6 3.5 3.7 3.5 1.2 0 2.1-.6 3.3-.6s2.1.6 3.3.6c2.1 0 3.7-1.5 3.7-3.5 0-2.3-2.1-4-4.5-4-1 0-1.8.3-2.5.8-.7-.5-1.5-.8-2.5-.8Z"/><circle cx="5" cy="8" r="2"/><circle cx="10" cy="5.5" r="2"/><circle cx="15" cy="8" r="2"/></>,
    vaccine: <><path d="M7 3h10v4H7zM9 7v9a4 4 0 0 0 8 0V7M6 13h5M4 11l2 2-2 2M12 3V1M16 3V1"/></>,
    sterilize: <><circle cx="10" cy="10" r="5"/><path d="m14 14 5 5M15 19h4v-4M10 5V1M8 3h4"/></>,
    request: <><path d="M5 3h10l4 4v14H5zM15 3v5h5M8 12h8M8 16h6"/></>,
    case: <><path d="M12 3 2.5 20h19zM12 9v5M12 17h.01"/></>,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5M6.1 8A7 7 0 0 1 18 6l2 5M17.9 16A7 7 0 0 1 6 18l-2-5"/></>,
    pin: <><path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></>,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name] || paths.pets}
    </svg>
  );
}

function KpiCard({ metric, active, icon, label, value, suffix = "", detail, tone, onSelect, unavailable = false }) {
  return (
    <button
      type="button"
      className={`production-kpi production-kpi--${tone} ${active ? "is-active" : ""}`}
      onClick={() => onSelect(metric)}
      aria-pressed={active}
    >
      <span className="production-kpi__icon"><Icon name={icon} /></span>
      <span className="production-kpi__body">
        <small>{label}</small>
        <strong>{unavailable ? "—" : `${toNumber(value).toLocaleString("th-TH")}${suffix}`}</strong>
        <em>{unavailable ? "รอข้อมูลจาก API" : detail}</em>
      </span>
    </button>
  );
}

function ProgressBar({ label, value, count, total, tone }) {
  const safeValue = Math.max(0, Math.min(100, toNumber(value)));
  return (
    <div className="production-progress">
      <div>
        <span>{label}</span>
        <b>{safeValue}%</b>
      </div>
      <i><b className={tone} style={{ width: `${safeValue}%` }} /></i>
      <small>{toNumber(count).toLocaleString("th-TH")} จาก {toNumber(total).toLocaleString("th-TH")} ตัว</small>
    </div>
  );
}

function buildTasks(row) {
  const tasks = [];

  if (row.pending > 0) {
    tasks.push({
      tone: "amber",
      title: `คำขอรอตรวจ ${row.pending.toLocaleString("th-TH")} คำขอ`,
      detail: "ตรวจข้อมูลเจ้าของและสัตว์ก่อนอนุมัติ",
      route: "registrations",
    });
  }
  if (row.openCases > 0) {
    tasks.push({
      tone: "rose",
      title: `เหตุที่ยังไม่ปิด ${row.openCases.toLocaleString("th-TH")} เหตุ`,
      detail: "ติดตามผู้รับผิดชอบและอัปเดตสถานะ",
      route: "cases",
    });
  }
  if (row.totalPets > 0 && row.vaccinationCoverage < 70) {
    tasks.push({
      tone: "amber",
      title: `ยังขาดประวัติวัคซีน ${Math.max(0, row.totalPets - row.vaccinated).toLocaleString("th-TH")} ตัว`,
      detail: "จัดลำดับพื้นที่สำหรับติดตามวัคซีน",
      route: "services",
    });
  }
  if (row.totalPets > 0 && row.sterilizationCoverage < 50) {
    tasks.push({
      tone: "violet",
      title: `ยังไม่มีประวัติทำหมัน ${Math.max(0, row.totalPets - row.sterilized).toLocaleString("th-TH")} ตัว`,
      detail: "ตรวจสอบข้อมูลและวางแผนบริการ",
      route: "services",
    });
  }

  return tasks.slice(0, 4);
}

function AreaPanel({ row, selected, onClear, navigate }) {
  const tasks = buildTasks(row);

  return (
    <aside className="production-area-panel">
      <header className="production-area-panel__header">
        <div>
          <small>{selected ? "พื้นที่ที่เลือก" : "ภาพรวมพื้นที่"}</small>
          <h2>{selected ? `หมู่ ${row.id}` : "ตำบลท่าโพธ์"}</h2>
          <p>{selected ? row.villageName : "รวมข้อมูล 11 หมู่บ้าน"}</p>
        </div>
        {selected ? <button type="button" onClick={onClear}>ล้างการเลือก</button> : null}
      </header>

      <section className="production-area-summary" aria-label="จำนวนสัตว์ในพื้นที่">
        <div className="is-primary">
          <span>สัตว์ทั้งหมด</span>
          <strong>{row.totalPets.toLocaleString("th-TH")}</strong>
          <small>ตัว</small>
        </div>
        <div>
          <span>สุนัข</span>
          <strong>{row.dogs.toLocaleString("th-TH")}</strong>
          <small>ตัว</small>
        </div>
        <div>
          <span>แมว</span>
          <strong>{row.cats.toLocaleString("th-TH")}</strong>
          <small>ตัว</small>
        </div>
      </section>

      <section className="production-coverage-card">
        <h3>ความครอบคลุมบริการ</h3>
        <ProgressBar
          label="วัคซีนภายใน 1 ปี"
          value={row.vaccinationCoverage}
          count={row.vaccinated}
          total={row.totalPets}
          tone="green"
        />
        <ProgressBar
          label="การทำหมัน"
          value={row.sterilizationCoverage}
          count={row.sterilized}
          total={row.totalPets}
          tone="violet"
        />
      </section>

      <section className="production-task-card">
        <div className="production-section-heading">
          <div>
            <h3>รายการที่ต้องดำเนินการ</h3>
            <p>เรียงเฉพาะสิ่งที่ต้องติดตามจากข้อมูลปัจจุบัน</p>
          </div>
        </div>

        {tasks.length ? (
          <div className="production-task-list">
            {tasks.map((task) => (
              <button type="button" key={`${task.route}-${task.title}`} onClick={() => navigate(task.route)}>
                <i className={task.tone}>!</i>
                <span><b>{task.title}</b><small>{task.detail}</small></span>
                <em>›</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="production-empty-state">
            <strong>ไม่พบงานเร่งด่วน</strong>
            <span>ข้อมูลพื้นที่นี้ไม่มีรายการค้างตามเงื่อนไขปัจจุบัน</span>
          </div>
        )}
      </section>
    </aside>
  );
}

function VillageComparison({ rows, metric, selectedVillage, onSelect, onHover }) {
  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;
  const maximum = metricInfo.unit === "%"
    ? 100
    : Math.max(1, ...rows.map((row) => getMetricValue(row, metric)));

  return (
    <section className="production-village-card">
      <header className="production-section-heading">
        <div>
          <small>เปรียบเทียบพื้นที่</small>
          <h2>ข้อมูลรายหมู่</h2>
          <p>เลือกแถวเพื่อซูมแผนที่และดูรายละเอียดของหมู่นั้น</p>
        </div>
        <span>{metricInfo.label}</span>
      </header>

      <div className="production-village-grid">
        {rows.map((row) => {
          const value = getMetricValue(row, metric);
          const width = Math.max(value > 0 ? 4 : 0, Math.round((value / maximum) * 100));
          const active = Number(selectedVillage) === row.id;
          return (
            <button
              type="button"
              key={row.id}
              className={active ? "is-active" : ""}
              onClick={() => onSelect(active ? null : row.id)}
              onMouseEnter={() => onHover(row.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(row.id)}
              onBlur={() => onHover(null)}
            >
              <span className="production-village-grid__number">{row.id}</span>
              <span className="production-village-grid__text">
                <b>หมู่ {row.id}</b>
                <small>สุนัข {row.dogs.toLocaleString("th-TH")} · แมว {row.cats.toLocaleString("th-TH")}</small>
                <i><b style={{ width: `${width}%` }} /></i>
              </span>
              <strong>{metricInfo.unit === "%" ? `${value}%` : value.toLocaleString("th-TH")}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LatestRequests({ requests, navigate }) {
  const items = requests.slice(0, 5);

  return (
    <section className="production-request-card">
      <header className="production-section-heading">
        <div>
          <small>งานล่าสุด</small>
          <h2>คำขอขึ้นทะเบียน</h2>
          <p>แสดงรายการล่าสุดจากระบบ ไม่ใช่ข้อมูลจำลองบนหน้าเว็บ</p>
        </div>
        <button type="button" onClick={() => navigate("registrations")}>ดูทั้งหมด</button>
      </header>

      {items.length ? (
        <div className="production-request-list">
          {items.map((item) => {
            const status = requestStatus[item.status] || [item.status || "-", "gray"];
            return (
              <button type="button" key={item.id || item.referenceNo} onClick={() => navigate("registrations")}>
                <span className="production-request-list__pet">{item.species === "DOG" ? "ส" : "ม"}</span>
                <span>
                  <b>{item.petName || "ไม่ระบุชื่อ"}</b>
                  <small>{item.ownerName || item.referenceNo || "ไม่ระบุเจ้าของ"} · หมู่ {item.villageNo || "-"}</small>
                </span>
                <em className={status[1]}>{status[0]}</em>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="production-empty-state">
          <strong>ยังไม่มีคำขอ</strong>
          <span>เมื่อมีรายการใหม่ ระบบจะแสดงที่ส่วนนี้</span>
        </div>
      )}
    </section>
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
  const [apiStatus, setApiStatus] = useState({ successful: 0, total: 5 });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [villageReportLoaded, setVillageReportLoaded] = useState(false);

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
      setRequests(
        registrationResult.status === "fulfilled" && Array.isArray(registrationResult.value)
          ? registrationResult.value
          : [],
      );
      setVillages(
        villageResult.status === "fulfilled" && Array.isArray(villageResult.value)
          ? villageResult.value
          : [],
      );
      setVillageReportLoaded(villageResult.status === "fulfilled" && Array.isArray(villageResult.value));
      setMapItems(
        mapResult.status === "fulfilled" && Array.isArray(mapResult.value)
          ? mapResult.value
          : [],
      );
      setCases(
        caseResult.status === "fulfilled" && Array.isArray(caseResult.value)
          ? caseResult.value
          : [],
      );
      setApiStatus({
        successful: results.filter((result) => result.status === "fulfilled").length,
        total: results.length,
      });
      setLastUpdatedAt(new Date());
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

  const total = villageReportLoaded ? summary.totalPets : toNumber(stats.total);
  const dogs = villageReportLoaded ? summary.dogs : toNumber(stats.dogs);
  const cats = villageReportLoaded ? summary.cats : toNumber(stats.cats);
  const vaccinated = villageReportLoaded ? summary.vaccinated : toNumber(stats.vaccinations);
  const sterilized = villageReportLoaded ? summary.sterilized : toNumber(stats.sterilizations);
  const vaccinationCoverage = total ? Math.round((vaccinated * 100) / total) : 0;
  const sterilizationCoverage = total ? Math.round((sterilized * 100) / total) : 0;
  const pending = villageReportLoaded ? summary.pending : toNumber(stats.pending);
  const openCases = villageReportLoaded ? summary.openCases : toNumber(stats.openCases);
  const live = apiStatus.successful === apiStatus.total;
  const dataUnavailable = !loading && apiStatus.successful === 0;
  const buddhistYear = new Date().getFullYear() + 543;

  return (
    <main className="production-dashboard">
      <header className="production-dashboard__header">
        <div>
          <span>ระบบทะเบียนและติดตามสัตว์เลี้ยง · ปี {buddhistYear}</span>
          <h1>ภาพรวมและแผนที่พื้นที่</h1>
          <p>ข้อมูลสถิติจากฐานข้อมูล และหมุดจากพิกัดหลังคาเรือนที่บันทึกไว้จริง</p>
        </div>

        <div className="production-dashboard__tools">
          <label>
            <span>เลือกพื้นที่</span>
            <select
              value={selectedVillage || ""}
              onChange={(event) => setSelectedVillage(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">ทุกหมู่บ้าน</option>
              {villageRows.map((row) => <option key={row.id} value={row.id}>หมู่ {row.id}</option>)}
            </select>
          </label>

          <div className={`production-sync ${live ? "is-live" : "is-warning"}`}>
            <i />
            <span>{loading ? "กำลังโหลดข้อมูล" : live ? "เชื่อมต่อข้อมูลครบ" : `เชื่อมต่อได้ ${apiStatus.successful}/${apiStatus.total} ส่วน`}</span>
            <small>อัปเดต {formatTime(lastUpdatedAt)}</small>
          </div>

          <button
            type="button"
            className="production-refresh"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            <Icon name="refresh" />
            <span>{loading ? "กำลังรีเฟรช" : "รีเฟรช"}</span>
          </button>
        </div>
      </header>

      {!live && !loading ? (
        <div className="production-api-warning">
          <strong>ข้อมูลบางส่วนโหลดไม่สำเร็จ</strong>
          <span>ระบบจะไม่สร้างข้อมูลขึ้นมาทดแทน กรุณาตรวจ API แล้วกดรีเฟรช</span>
        </div>
      ) : null}

      <section className="production-kpi-grid" aria-label="ตัวชี้วัดภาพรวม">
        <KpiCard
          metric="total"
          active={metric === "total"}
          icon="pets"
          label="สัตว์ขึ้นทะเบียน"
          value={total}
          detail={`สุนัข ${dogs.toLocaleString("th-TH")} · แมว ${cats.toLocaleString("th-TH")}`}
          tone="green"
          onSelect={setMetric}
          unavailable={dataUnavailable}
        />
        <KpiCard
          metric="vaccination"
          active={metric === "vaccination"}
          icon="vaccine"
          label="ครอบคลุมวัคซีน"
          value={vaccinationCoverage}
          suffix="%"
          detail={`${vaccinated.toLocaleString("th-TH")} ตัวมีประวัติภายใน 1 ปี`}
          tone="teal"
          onSelect={setMetric}
          unavailable={dataUnavailable}
        />
        <KpiCard
          metric="sterilization"
          active={metric === "sterilization"}
          icon="sterilize"
          label="ครอบคลุมทำหมัน"
          value={sterilizationCoverage}
          suffix="%"
          detail={`${sterilized.toLocaleString("th-TH")} ตัวมีประวัติ`}
          tone="violet"
          onSelect={setMetric}
          unavailable={dataUnavailable}
        />
        <KpiCard
          metric="pending"
          active={metric === "pending"}
          icon="request"
          label="คำขอรอตรวจ"
          value={pending}
          detail="คำขอที่ยังต้องดำเนินการ"
          tone="amber"
          onSelect={setMetric}
          unavailable={dataUnavailable}
        />
        <KpiCard
          metric="cases"
          active={metric === "cases"}
          icon="case"
          label="เหตุที่ยังไม่ปิด"
          value={openCases}
          detail="เหตุแจ้งที่ต้องติดตาม"
          tone="rose"
          onSelect={setMetric}
          unavailable={dataUnavailable}
        />
      </section>

      <section className="production-dashboard__workspace">
        <DashboardMap
          rows={villageRows}
          metric={metric}
          selectedVillage={selectedVillage}
          hoveredVillage={hoveredVillage}
          onMetricChange={setMetric}
          onVillageSelect={setSelectedVillage}
          onVillageHover={setHoveredVillage}
        />

        <AreaPanel
          row={currentRow}
          selected={Boolean(selectedRow)}
          onClear={() => setSelectedVillage(null)}
          navigate={navigate}
        />
      </section>

      <section className="production-dashboard__lower-grid">
        <VillageComparison
          rows={villageRows}
          metric={metric}
          selectedVillage={selectedVillage}
          onSelect={setSelectedVillage}
          onHover={setHoveredVillage}
        />
        <LatestRequests requests={requests} navigate={navigate} />
      </section>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import DashboardMap from "../components/DashboardMap.jsx";
import { createApi } from "../lib/api.js";
import {
  DASHBOARD_METRICS,
  buildVillageRows,
  getMetricValue,
  summarizeVillageRows,
} from "../lib/dashboardVillageData.js";

const INITIAL_STATS = {
  total: 0,
  dogs: 0,
  cats: 0,
  pending: 0,
  vaccinations: 0,
  sterilizations: 0,
  noVaccination: 0,
  overdueVaccinations: 0,
  dueSoonVaccinations: 0,
};

const REQUEST_STATUS = {
  SUBMITTED: ["รอตรวจ", "amber"],
  UNDER_REVIEW: ["กำลังตรวจ", "blue"],
  NEED_MORE_INFO: ["รอเจ้าของแก้ไข", "rose"],
  APPROVED: ["รับรองแล้ว", "green"],
  REJECTED: ["ไม่ผ่าน", "gray"],
  CANCELLED: ["ยกเลิก", "gray"],
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((toNumber(value) * 100) / toNumber(total))));
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
    pets: (
      <>
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="7" r="2" />
        <circle cx="5" cy="13" r="2" />
        <circle cx="19" cy="13" r="2" />
        <path d="M12 11c-3.3 0-6 2.3-6 5.1C6 18.8 8.4 21 12 21s6-2.2 6-4.9C18 13.3 15.3 11 12 11Z" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 4h16v14H4z" />
        <path d="M4 13h4l2 3h4l2-3h4" />
      </>
    ),
    vaccine: (
      <>
        <path d="M7 3h10v4H7zM9 7v9a4 4 0 0 0 8 0V7" />
        <path d="M6 13h5M4 11l2 2-2 2M12 3V1M16 3V1" />
      </>
    ),
    sterilize: (
      <>
        <circle cx="10" cy="10" r="5" />
        <path d="m14 14 5 5M15 19h4v-4M10 5V1M8 3h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M6.1 8A7 7 0 0 1 18 6l2 5M17.9 16A7 7 0 0 1 6 18l-2-5" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    line: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="5" />
        <path d="M8 9h8M8 13h5M9 18l-2 3" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.pets}
    </svg>
  );
}

function MetricCard({ icon, label, value, suffix = "", detail, tone, active, onClick }) {
  return (
    <button
      type="button"
      className={`v6-kpi v6-kpi--${tone} ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="v6-kpi__icon"><Icon name={icon} /></span>
      <span className="v6-kpi__copy">
        <small>{label}</small>
        <strong>{toNumber(value).toLocaleString("th-TH")}{suffix}</strong>
        <em>{detail}</em>
      </span>
      <span className="v6-kpi__arrow"><Icon name="arrow" /></span>
    </button>
  );
}

function Coverage({ label, value, count, total, tone }) {
  const safeValue = Math.max(0, Math.min(100, toNumber(value)));
  return (
    <div className="v6-coverage">
      <div>
        <span>{label}</span>
        <strong>{safeValue}%</strong>
      </div>
      <i><b className={tone} style={{ width: `${safeValue}%` }} /></i>
      <small>{toNumber(count).toLocaleString("th-TH")} จาก {toNumber(total).toLocaleString("th-TH")} ตัว</small>
    </div>
  );
}

function AreaSummary({ row, selected, onClear, pending, overdue, dueSoon, navigate }) {
  const tasks = [
    pending > 0 && {
      tone: "amber",
      title: `${pending.toLocaleString("th-TH")} ข้อมูลรอตรวจ`,
      detail: "ตรวจข้อมูลจาก LINE และเว็บไซต์",
      route: "registrations",
    },
    overdue > 0 && {
      tone: "red",
      title: `${overdue.toLocaleString("th-TH")} ตัวเลยกำหนดวัคซีน`,
      detail: "ติดตามเจ้าของสัตว์เลี้ยงเร่งด่วน",
      route: "services",
    },
    dueSoon > 0 && {
      tone: "blue",
      title: `${dueSoon.toLocaleString("th-TH")} ตัวใกล้ครบกำหนด`,
      detail: "เตรียมส่งการแจ้งเตือนล่วงหน้า",
      route: "services",
    },
    row.totalPets > 0 && row.sterilizationCoverage < 60 && {
      tone: "violet",
      title: `${Math.max(0, row.totalPets - row.sterilized).toLocaleString("th-TH")} ตัวยังไม่มีข้อมูลทำหมัน`,
      detail: "วางแผนติดตามตามพื้นที่",
      route: "services",
    },
  ].filter(Boolean).slice(0, 4);

  return (
    <aside className="v6-area-rail">
      <header>
        <div>
          <span>{selected ? "พื้นที่ที่เลือก" : "ภาพรวมทั้งเทศบาล"}</span>
          <h2>{selected ? `หมู่ ${row.id}` : "เทศบาลท่าโพธ์"}</h2>
          <p>{selected ? row.villageName : "รวมข้อมูล 11 หมู่บ้าน"}</p>
        </div>
        {selected ? <button type="button" onClick={onClear}>ล้างพื้นที่</button> : null}
      </header>

      <section className="v6-animal-summary">
        <article className="is-primary">
          <span>สัตว์ทั้งหมด</span>
          <strong>{toNumber(row.totalPets).toLocaleString("th-TH")}</strong>
          <small>ตัว</small>
        </article>
        <article>
          <span>สุนัข</span>
          <strong>{toNumber(row.dogs).toLocaleString("th-TH")}</strong>
          <small>ตัว</small>
        </article>
        <article>
          <span>แมว</span>
          <strong>{toNumber(row.cats).toLocaleString("th-TH")}</strong>
          <small>ตัว</small>
        </article>
      </section>

      <section className="v6-rail-section">
        <div className="v6-rail-title">
          <h3>ความครอบคลุมบริการ</h3>
          <span>ข้อมูลล่าสุดที่บันทึกในทะเบียน</span>
        </div>
        <Coverage
          label="วัคซีนภายใน 1 ปี"
          value={row.vaccinationCoverage}
          count={row.vaccinated}
          total={row.totalPets}
          tone="green"
        />
        <Coverage
          label="การทำหมัน"
          value={row.sterilizationCoverage}
          count={row.sterilized}
          total={row.totalPets}
          tone="violet"
        />
      </section>

      <section className="v6-rail-section v6-task-section">
        <div className="v6-rail-title">
          <h3>สิ่งที่ควรทำต่อ</h3>
          <span>เรียงตามความสำคัญจากข้อมูลจริง</span>
        </div>
        {tasks.length ? (
          <div className="v6-task-list">
            {tasks.map((task) => (
              <button type="button" key={task.title} onClick={() => navigate(task.route)}>
                <i className={task.tone}>!</i>
                <span><strong>{task.title}</strong><small>{task.detail}</small></span>
                <em>›</em>
              </button>
            ))}
          </div>
        ) : (
          <div className="v6-empty-compact">
            <strong>ไม่พบงานเร่งด่วน</strong>
            <span>พื้นที่นี้ไม่มีรายการค้างตามเกณฑ์ปัจจุบัน</span>
          </div>
        )}
      </section>
    </aside>
  );
}

function LatestCitizenData({ items, navigate }) {
  const rows = items.slice(0, 6);
  return (
    <section className="v6-card v6-latest-card">
      <header className="v6-card-head">
        <div>
          <span><Icon name="line" /> ช่องทางประชาชน</span>
          <h2>ข้อมูลล่าสุดจาก LINE และเว็บไซต์</h2>
          <p>เปิดดูรายการเพื่อรับตรวจ ส่งกลับแก้ไข หรือรับรองเข้าทะเบียน</p>
        </div>
        <button type="button" onClick={() => navigate("registrations")}>เปิดศูนย์รับข้อมูล</button>
      </header>

      {rows.length ? (
        <div className="v6-latest-list">
          {rows.map((item) => {
            const status = REQUEST_STATUS[item.status] || [item.status || "ไม่ระบุ", "gray"];
            return (
              <button type="button" key={`${item.sourceType || "registration"}:${item.id || item.referenceNo}`} onClick={() => navigate("registrations")}>
                <span className={`v6-pet-badge ${item.species === "DOG" ? "dog" : "cat"}`}>
                  {item.species === "DOG" ? "ส" : "ม"}
                </span>
                <span className="v6-latest-copy">
                  <strong>{item.petName || "ไม่ระบุชื่อสัตว์"}</strong>
                  <small>{item.ownerName || item.referenceNo || "ไม่ระบุเจ้าของ"} · หมู่ {item.villageNo || "—"}</small>
                </span>
                <span className={`v6-status v6-status--${status[1]}`}>{status[0]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="v6-empty-compact">
          <strong>ยังไม่มีข้อมูลใหม่</strong>
          <span>เมื่อประชาชนส่งข้อมูลผ่าน LINE หรือเว็บไซต์ ระบบจะแสดงที่นี่</span>
        </div>
      )}
    </section>
  );
}

function buildVillageHealth(mapItems) {
  const rows = new Map();

  mapItems.forEach((pet) => {
    const villageNo = toNumber(pet.villageNo);
    if (!villageNo) return;

    const current = rows.get(villageNo) || {
      villageNo,
      critical: 0,
      partial: 0,
      complete: 0,
      total: 0,
    };
    const vaccinated = Boolean(pet.vaccinated);
    const sterilized = Boolean(pet.sterilized);

    if (vaccinated && sterilized) current.complete += 1;
    else if (vaccinated || sterilized) current.partial += 1;
    else current.critical += 1;

    current.total += 1;
    rows.set(villageNo, current);
  });

  return [...rows.values()].sort((a, b) => {
    const riskRatioA = a.total ? ((a.critical * 2) + a.partial) / (a.total * 2) : 0;
    const riskRatioB = b.total ? ((b.critical * 2) + b.partial) / (b.total * 2) : 0;
    return riskRatioB - riskRatioA || b.critical - a.critical || b.total - a.total;
  });
}

function VillageAttention({ mapItems, selectedVillage, onSelect }) {
  const rows = useMemo(() => buildVillageHealth(mapItems).slice(0, 6), [mapItems]);

  return (
    <section className="v6-card v6-village-attention">
      <header className="v6-card-head v7-village-head">
        <div>
          <span>พื้นที่ควรติดตาม</span>
          <h2>หมู่บ้านตามสัดส่วนสุขภาพ</h2>
          <p>เรียงจากสัดส่วนสัตว์ที่ต้องติดตาม ไม่ใช่จากจำนวนสัตว์รวมเพียงอย่างเดียว</p>
        </div>
        <div className="v7-health-legend" aria-label="คำอธิบายสีสถานะ">
          <span className="is-critical"><i />แดง</span>
          <span className="is-partial"><i />ส้ม</span>
          <span className="is-complete"><i />เขียว</span>
        </div>
      </header>

      {rows.length ? (
        <div className="v7-village-distribution-list">
          {rows.map((row) => {
            const active = Number(selectedVillage) === row.villageNo;
            const total = Math.max(1, row.total);
            const criticalPercent = (row.critical / total) * 100;
            const partialPercent = (row.partial / total) * 100;
            const completePercent = (row.complete / total) * 100;
            const followUp = row.critical + row.partial;

            return (
              <button
                type="button"
                key={row.villageNo}
                className={active ? "is-active" : ""}
                onClick={() => onSelect(active ? null : row.villageNo)}
                aria-label={`หมู่ ${row.villageNo} สัตว์ ${row.total} ตัว แดง ${row.critical} ส้ม ${row.partial} เขียว ${row.complete}`}
              >
                <span className="v6-village-number">{row.villageNo}</span>
                <span className="v7-village-summary">
                  <strong>หมู่ {row.villageNo}</strong>
                  <small>ต้องติดตาม {followUp.toLocaleString("th-TH")} จาก {row.total.toLocaleString("th-TH")} ตัว</small>
                </span>
                <span className="v7-health-distribution">
                  <span
                    className="v7-health-bar"
                    role="img"
                    aria-label={`แดง ${Math.round(criticalPercent)} เปอร์เซ็นต์ ส้ม ${Math.round(partialPercent)} เปอร์เซ็นต์ เขียว ${Math.round(completePercent)} เปอร์เซ็นต์`}
                  >
                    {row.critical > 0 ? (
                      <i
                        className="is-critical"
                        style={{ width: `${criticalPercent}%` }}
                        title={`แดง ${row.critical} ตัว (${Math.round(criticalPercent)}%)`}
                      />
                    ) : null}
                    {row.partial > 0 ? (
                      <i
                        className="is-partial"
                        style={{ width: `${partialPercent}%` }}
                        title={`ส้ม ${row.partial} ตัว (${Math.round(partialPercent)}%)`}
                      />
                    ) : null}
                    {row.complete > 0 ? (
                      <i
                        className="is-complete"
                        style={{ width: `${completePercent}%` }}
                        title={`เขียว ${row.complete} ตัว (${Math.round(completePercent)}%)`}
                      />
                    ) : null}
                  </span>
                  <span className="v7-health-values" aria-hidden="true">
                    <em className="is-critical">แดง {row.critical}</em>
                    <em className="is-partial">ส้ม {row.partial}</em>
                    <em className="is-complete">เขียว {row.complete}</em>
                  </span>
                </span>
                <span className="v7-village-total">
                  <strong>{row.total.toLocaleString("th-TH")}</strong>
                  <small>ตัว</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="v6-empty-compact">
          <strong>ยังไม่มีข้อมูลพิกัดเพียงพอ</strong>
          <span>รายการจะแสดงเมื่อสัตว์เลี้ยงมีพิกัดและสถานะสุขภาพ</span>
        </div>
      )}
    </section>
  );
}

export default function DashboardPage({ token, navigate }) {
  const api = useMemo(() => createApi(token), [token]);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [requests, setRequests] = useState([]);
  const [queueSummary, setQueueSummary] = useState({});
  const [villages, setVillages] = useState([]);
  const [mapItems, setMapItems] = useState([]);
  const [metric, setMetric] = useState("total");
  const [selectedVillage, setSelectedVillage] = useState(null);
  const [hoveredVillage, setHoveredVillage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState({ successful: 0, total: 4 });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [villageReportLoaded, setVillageReportLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.allSettled([
      api.get("/api/admin/dashboard"),
      api.getPage("/api/admin/review-queue?page=1&pageSize=12&status=PENDING&sort=urgent"),
      api.get("/api/admin/reports/villages"),
      api.get("/api/admin/map"),
    ]).then((results) => {
      if (!active) return;
      const [dashboardResult, queueResult, villageResult, mapResult] = results;

      setStats(
        dashboardResult.status === "fulfilled" && dashboardResult.value && typeof dashboardResult.value === "object"
          ? dashboardResult.value
          : INITIAL_STATS,
      );
      setRequests(
        queueResult.status === "fulfilled" && Array.isArray(queueResult.value?.data)
          ? queueResult.value.data
          : [],
      );
      setQueueSummary(
        queueResult.status === "fulfilled" && queueResult.value?.summary
          ? queueResult.value.summary
          : {},
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
    () => buildVillageRows({ villages, items: mapItems, requests }),
    [villages, mapItems, requests],
  );
  const summary = useMemo(() => summarizeVillageRows(villageRows), [villageRows]);
  const selectedRow = villageRows.find((row) => row.id === Number(selectedVillage)) || null;
  const currentRow = selectedRow || summary;

  const total = villageReportLoaded ? summary.totalPets : toNumber(stats.total);
  const dogs = villageReportLoaded ? summary.dogs : toNumber(stats.dogs);
  const cats = villageReportLoaded ? summary.cats : toNumber(stats.cats);
  const vaccinated = villageReportLoaded ? summary.vaccinated : toNumber(stats.vaccinations);
  const sterilized = villageReportLoaded ? summary.sterilized : toNumber(stats.sterilizations);
  const vaccinationCoverage = percent(vaccinated, total);
  const sterilizationCoverage = percent(sterilized, total);
  const pending =
    toNumber(queueSummary.submitted) +
    toNumber(queueSummary.underReview) +
    toNumber(queueSummary.needMoreInfo) ||
    (villageReportLoaded ? summary.pending : toNumber(stats.pending));
  const overdueVaccinations = toNumber(stats.overdueVaccinations);
  const dueSoonVaccinations = toNumber(stats.dueSoonVaccinations);
  const live = apiStatus.successful === apiStatus.total;
  const buddhistYear = new Date().getFullYear() + 543;

  return (
    <div className="v6-dashboard">
      <header className="v6-dashboard-head">
        <div>
          <p className="v6-eyebrow">ศูนย์ปฏิบัติการทะเบียนสัตว์เลี้ยง · ปี {buddhistYear}</p>
          <h1>สถานการณ์สัตว์เลี้ยงในพื้นที่</h1>
          <p>ติดตามทะเบียน สุขภาพ พิกัด และข้อมูลจากเจ้าของสัตว์เลี้ยงผ่าน LINE ในหน้าจอเดียว</p>
        </div>

        <div className="v6-dashboard-tools">
          <label>
            <span>พื้นที่ข้อมูล</span>
            <select
              value={selectedVillage || ""}
              onChange={(event) => setSelectedVillage(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">ทุกหมู่บ้าน</option>
              {villageRows.map((row) => <option key={row.id} value={row.id}>หมู่ {row.id}</option>)}
            </select>
          </label>
          <div className={`v6-sync ${live ? "is-live" : "is-warning"}`}>
            <i />
            <span>
              <strong>{loading ? "กำลังเชื่อมต่อ" : live ? "ข้อมูลพร้อมใช้งาน" : `พร้อม ${apiStatus.successful}/${apiStatus.total} ส่วน`}</strong>
              <small>อัปเดต {formatTime(lastUpdatedAt)}</small>
            </span>
          </div>
          <button type="button" className="v6-refresh" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <Icon name="refresh" />
            <span>{loading ? "กำลังโหลด" : "รีเฟรช"}</span>
          </button>
        </div>
      </header>

      {!live && !loading ? (
        <div className="v6-api-warning">
          <strong>ข้อมูลบางส่วนเชื่อมต่อไม่สำเร็จ</strong>
          <span>ระบบจะแสดงเฉพาะข้อมูลจริงที่ได้รับ และจะไม่สร้างข้อมูลจำลองทดแทน</span>
        </div>
      ) : null}

      <section className="v6-kpi-grid" aria-label="ตัวชี้วัดสำคัญ">
        <MetricCard
          icon="pets"
          label="สัตว์เลี้ยงในทะเบียน"
          value={total}
          detail={`สุนัข ${dogs.toLocaleString("th-TH")} · แมว ${cats.toLocaleString("th-TH")}`}
          tone="green"
          active={metric === "total"}
          onClick={() => setMetric("total")}
        />
        <MetricCard
          icon="inbox"
          label="ข้อมูลรอตรวจจากประชาชน"
          value={pending}
          detail={`เร่งด่วน ${toNumber(queueSummary.urgent).toLocaleString("th-TH")} รายการ`}
          tone="amber"
          active={metric === "pending"}
          onClick={() => setMetric("pending")}
        />
        <MetricCard
          icon="vaccine"
          label="ความครอบคลุมวัคซีน"
          value={vaccinationCoverage}
          suffix="%"
          detail={`${vaccinated.toLocaleString("th-TH")} ตัวมีประวัติภายใน 1 ปี`}
          tone="teal"
          active={metric === "vaccination"}
          onClick={() => setMetric("vaccination")}
        />
        <MetricCard
          icon="sterilize"
          label="ความครอบคลุมทำหมัน"
          value={sterilizationCoverage}
          suffix="%"
          detail={`${sterilized.toLocaleString("th-TH")} ตัวมีประวัติ`}
          tone="violet"
          active={metric === "sterilization"}
          onClick={() => setMetric("sterilization")}
        />
      </section>

      {(overdueVaccinations > 0 || dueSoonVaccinations > 0) ? (
        <button type="button" className="v6-followup-strip" onClick={() => navigate("services")}>
          <span><Icon name="vaccine" /></span>
          <div>
            <small>งานสุขภาพที่ต้องติดตาม</small>
            <strong>{(overdueVaccinations + dueSoonVaccinations).toLocaleString("th-TH")} ตัว</strong>
            <em>เลยกำหนด {overdueVaccinations.toLocaleString("th-TH")} · ใกล้กำหนด {dueSoonVaccinations.toLocaleString("th-TH")}</em>
          </div>
          <b>เปิดงานวัคซีน →</b>
        </button>
      ) : null}

      <section className="v6-dashboard-workspace">
        <DashboardMap
          rows={villageRows}
          metric={metric}
          selectedVillage={selectedVillage}
          hoveredVillage={hoveredVillage}
          onMetricChange={setMetric}
          onVillageSelect={setSelectedVillage}
          onVillageHover={setHoveredVillage}
        />
        <AreaSummary
          row={currentRow}
          selected={Boolean(selectedRow)}
          onClear={() => setSelectedVillage(null)}
          pending={pending}
          overdue={overdueVaccinations}
          dueSoon={dueSoonVaccinations}
          navigate={navigate}
        />
      </section>

      <section className="v6-dashboard-lower">
        <LatestCitizenData items={requests} navigate={navigate} />
        <VillageAttention mapItems={mapItems} selectedVillage={selectedVillage} onSelect={setSelectedVillage} />
      </section>
    </div>
  );
}

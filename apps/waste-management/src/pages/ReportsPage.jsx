import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageHead,
  StatusBadge,
  formatDate,
  formatMoney,
  formatNumber,
  toDateInput,
} from "../components/ui.jsx";
import { wasteReportPolicy } from "../domain/WasteReportPolicy.js";

const OPERATION_STATUS_FILTERS = Object.freeze([
  { value: "ALL", label: "ทั้งหมด", countKey: "total" },
  { value: "SCHEDULED", label: "รอเริ่มงาน", countKey: "scheduled" },
  { value: "IN_PROGRESS", label: "กำลังปฏิบัติงาน", countKey: "inProgress" },
  { value: "COMPLETED", label: "เสร็จสิ้น", countKey: "completed" },
  { value: "INTERRUPTED", label: "หยุดชะงัก", countKey: "interrupted" },
]);

function currentMonth() {
  return toDateInput().slice(0, 7);
}

export default function ReportsPage({ token, navigate }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [from, setFrom] = useState(
    toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [to, setTo] = useState(toDateInput());
  const [billingMonth, setBillingMonth] = useState(currentMonth);
  const [operations, setOperations] = useState([]);
  const [billing, setBilling] = useState([]);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!wasteReportPolicy.isValidDateRange(from, to)) {
      setError("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const billingPeriod = wasteReportPolicy.billingPeriodDate(billingMonth);
      const [nextOperations, nextBilling] = await Promise.all([
        api.get(`/api/waste/reports/operations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api.get(
          billingPeriod
            ? `/api/waste/reports/billing?billingPeriod=${encodeURIComponent(billingPeriod)}`
            : "/api/waste/reports/billing",
        ),
      ]);

      setOperations(nextOperations);
      setBilling(nextBilling);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api, billingMonth, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredOperations = useMemo(
    () => wasteReportPolicy.filterOperations(operations, { status, search }),
    [operations, search, status],
  );
  const summary = useMemo(
    () => wasteReportPolicy.summarize(filteredOperations),
    [filteredOperations],
  );
  const statusBreakdown = useMemo(
    () => wasteReportPolicy.statusBreakdown(operations),
    [operations],
  );
  const billingSummary = useMemo(
    () => wasteReportPolicy.billingSummary(billing),
    [billing],
  );
  const hasLocalFilters = status !== "ALL" || Boolean(search.trim());

  const resetLocalFilters = () => {
    setStatus("ALL");
    setSearch("");
  };

  return <>
    <PageHead
      eyebrow="รายงานการปฏิบัติงาน"
      title="รายงานการเก็บขยะและค่าบริการ"
      detail="ตรวจสอบผลการปฏิบัติงานตามช่วงวันที่ และสถานะค่าบริการตามรอบที่เลือก"
      actions={<div className="waste-report-range">
        <label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>ถึง<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        <label>รอบค่าบริการ<input type="month" value={billingMonth} onChange={(event) => setBillingMonth(event.target.value)} /></label>
        <button type="button" className="waste-button waste-button--secondary" onClick={() => void load()}>รีเฟรช</button>
      </div>}
    />

    <ErrorNotice error={error} onRetry={load} />

    {loading ? <LoadingState /> : <>
      <section className="waste-kpis waste-kpis--reports" aria-label="สรุปรายงานตามตัวกรอง">
        <article><span>แผนปฏิบัติงานเก็บขยะ</span><strong>{formatNumber(summary.totalPlans)}</strong><small>แผนที่แสดง</small></article>
        <article><span>เสร็จสิ้น</span><strong>{formatNumber(summary.completedPlans)}</strong><small>แผน</small></article>
        <article><span>จุดเก็บที่ยืนยันแล้ว</span><strong>{formatNumber(summary.collectedStops)}</strong><small>จาก {formatNumber(summary.totalStops)} จุด</small></article>
        <article><span>ความครบถ้วน</span><strong>{summary.completionPercent === null ? "-" : `${summary.completionPercent}%`}</strong><small>ตามจุดที่กำหนด</small></article>
      </section>

      <section className="waste-report-statuses" aria-label="กรองสถานะแผนปฏิบัติงานเก็บขยะ">
        {OPERATION_STATUS_FILTERS.map((filter) => {
          const count = filter.countKey === "total" ? operations.length : statusBreakdown[filter.countKey];
          return <button key={filter.value} type="button" className={status === filter.value ? "is-active" : ""} aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)}>
            <span>{filter.label}</span><strong>{formatNumber(count)}</strong>
          </button>;
        })}
      </section>

      <section className="waste-panel">
        <header className="waste-panel__head waste-panel__head--filters">
          <div><p>OPERATIONS</p><h2>รายงานแผนปฏิบัติงานเก็บขยะ</h2></div>
          <div className="waste-report-filter-row">
            <label>ค้นหาแผน เส้นทาง รถ หรือพนักงาน<input type="search" value={search} placeholder="เช่น WST-20260821-004" onChange={(event) => setSearch(event.target.value)} /></label>
            <button type="button" className="waste-button waste-button--secondary" disabled={!hasLocalFilters} onClick={resetLocalFilters}>ล้างตัวกรอง</button>
          </div>
        </header>
        <div className="waste-report-result-note">แสดง {formatNumber(filteredOperations.length)} จาก {formatNumber(operations.length)} แผนปฏิบัติงานเก็บขยะ</div>
        {filteredOperations.length ? <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th scope="col">วันปฏิบัติงาน</th><th scope="col">แผนปฏิบัติงานเก็บขยะ / เส้นทาง</th><th scope="col">รถ / พนักงานประจำรถขยะ</th><th scope="col">จุดเก็บ</th><th scope="col">สถานะ</th></tr></thead><tbody>{filteredOperations.map((item) => <tr key={item.planNo}><td>{formatDate(item.scheduledDate)}</td><td><strong>{item.planNo}</strong><small>{item.routeName}</small></td><td><strong>{item.vehicleCode}</strong><small>{item.driverName}</small></td><td>{formatNumber(item.collectedStops)} / {formatNumber(item.stopTotal)} จุด</td><td><StatusBadge value={item.status} /></td></tr>)}</tbody></table></div> : <EmptyState title={operations.length ? "ไม่พบแผนปฏิบัติงานตามตัวกรอง" : "ยังไม่มีข้อมูลแผนปฏิบัติงานเก็บขยะในช่วงที่เลือก"} detail={operations.length ? "ปรับสถานะหรือคำค้นหา แล้วตรวจสอบอีกครั้ง" : "รายงานจะแสดงเมื่อมีการสร้างแผนปฏิบัติงานเก็บขยะ"} actionLabel={operations.length ? "ล้างตัวกรอง" : "จัดการแผนปฏิบัติงานเก็บขยะ"} onAction={operations.length ? resetLocalFilters : () => navigate("plans")} />}
      </section>

      <section className="waste-billing-summary" aria-label="สรุปค่าบริการตามรอบที่เลือก">
        <article><span>ชำระแล้ว</span><strong>{formatMoney(billingSummary.paidAmount)}</strong><small>{formatNumber(billingSummary.paidCount)} รายการ</small></article>
        <article className={billingSummary.pendingCount ? "is-warning" : ""}><span>รอชำระ</span><strong>{formatMoney(billingSummary.pendingAmount)}</strong><small>{formatNumber(billingSummary.pendingCount)} รายการ</small></article>
        <article className={billingSummary.overdueCount ? "is-warning" : ""}><span>ค้างชำระ</span><strong>{formatMoney(billingSummary.overdueAmount)}</strong><small>{formatNumber(billingSummary.overdueCount)} รายการ</small></article>
      </section>

      <section className="waste-panel">
        <header className="waste-panel__head"><div><p>BILLING</p><h2>สรุปค่าบริการตามรอบ</h2></div><button type="button" className="waste-text-button" onClick={() => navigate("billing")}>จัดการค่าบริการ</button></header>
        {billing.length ? <div className="waste-table-wrap"><table className="waste-table"><thead><tr><th scope="col">รอบค่าบริการ</th><th scope="col">สถานะ</th><th scope="col">จำนวนรายการ</th><th scope="col">ยอดรวม</th></tr></thead><tbody>{billing.map((item, index) => <tr key={`${item.billingPeriod}-${item.status}-${index}`}><td>{formatDate(item.billingPeriod, { month: "long", year: "numeric" })}</td><td><StatusBadge value={item.status} /></td><td>{formatNumber(item.count)} รายการ</td><td><strong>{formatMoney(item.amount)}</strong></td></tr>)}<tr className="waste-table__total"><td colSpan="2"><strong>รวมทั้งรอบ</strong></td><td><strong>{formatNumber(billingSummary.totalCount)} รายการ</strong></td><td><strong>{formatMoney(billingSummary.totalAmount)}</strong></td></tr></tbody></table></div> : <EmptyState title="ยังไม่มีข้อมูลค่าบริการในรอบที่เลือก" detail="ตรวจสอบรอบค่าบริการ หรือสร้างรายการค่าบริการให้ผู้ใช้บริการ" actionLabel="จัดการค่าบริการ" onAction={() => navigate("billing")} />}
      </section>
    </>}
  </>;
}

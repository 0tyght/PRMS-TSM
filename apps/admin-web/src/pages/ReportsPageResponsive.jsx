import { useEffect, useMemo, useState } from "react";
import { LoadingPanel, Notice, PageHead } from "../components/common/PageUI.jsx";
import { createApi } from "../lib/api.js";

function safeCsv(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(rows) {
  const data = [
    ["หมู่", "สัตว์ทั้งหมด", "สุนัข", "แมว", "ฉีดวัคซีน", "ทำหมัน"],
    ...rows.map((row) => [row.villageNo, row.totalPets, row.dogs, row.cats, row.vaccinated, row.sterilized]),
  ];
  const csv = data.map((row) => row.map(safeCsv).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "PRMS-TSM_รายงานรายหมู่บ้าน.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, detail, tone = "" }) {
  return <article className={tone}><span>{label}</span><b>{value}</b><small>{detail}</small></article>;
}

const OPERATIONAL_REPORTS = [
  { type: "registry", title: "ทะเบียนสัตว์รายตัว", detail: "เจ้าของ พื้นที่ ชนิด และสถานะ", formats: ["pdf", "xlsx"] },
  { type: "vaccination", title: "ความครอบคลุมวัคซีน", detail: "ยังมีผล ใกล้ครบกำหนด และเลยกำหนด", formats: ["pdf", "xlsx"] },
  { type: "sterilization", title: "ประวัติการทำหมัน", detail: "วันที่ พื้นที่ และหน่วยบริการ", formats: ["pdf", "xlsx"] },
  { type: "submissions", title: "คำขอและ SLA", detail: "ประเภท สถานะ อายุคำขอ และผู้ยื่น", formats: ["xlsx"] },
  { type: "data-quality", title: "คุณภาพข้อมูล", detail: "พิกัด ไมโครชิป และหลักฐานที่ยังขาด", formats: ["xlsx"] },
];

export default function ReportsPageResponsive({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [cutoff, setCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [villageId, setVillageId] = useState("");
  const [villages, setVillages] = useState([]);
  const [exporting, setExporting] = useState("");

  const load = () => {
    setLoading(true);
    setMessage("");
    const query = new URLSearchParams({ cutoff });
    if (villageId) query.set("villageId", villageId);
    api.get(`/api/admin/reports/villages-v2?${query}`)
      .then((data) => setRows(Array.isArray(data?.rows) ? data.rows : []))
      .catch((error) => {
        setRows([]);
        setMessage(error.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { api.get("/api/public/villages").then((data) => setVillages(Array.isArray(data) ? data : [])).catch(() => setVillages([])); }, [api]);
  useEffect(load, [api, cutoff, villageId]);

  const exportReport = async (format) => {
    const query = new URLSearchParams({ cutoff });
    if (villageId) query.set("villageId", villageId);
    setExporting(format);
    setMessage("");
    try {
      await api.download(`/api/admin/reports/villages/export/${format}?${query}`, `PRMS-TSM-village-report-${cutoff}.${format}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setExporting("");
    }
  };

  const exportOperational = async (type, format) => {
    const key = `${type}:${format}`;
    const query = new URLSearchParams({ cutoff });
    if (villageId) query.set("villageId", villageId);
    setExporting(key); setMessage("");
    try { await api.download(`/api/admin/reports/${type}/export/${format}?${query}`, `PRMS-TSM-${type}-${cutoff}.${format}`); }
    catch (error) { setMessage(error.message); }
    finally { setExporting(""); }
  };

  const totals = rows.reduce(
    (result, row) => ({
      pets: result.pets + Number(row.totalPets || 0),
      dogs: result.dogs + Number(row.dogs || 0),
      cats: result.cats + Number(row.cats || 0),
      vaccinated: result.vaccinated + Number(row.vaccinated || 0),
      sterilized: result.sterilized + Number(row.sterilized || 0),
    }),
    { pets: 0, dogs: 0, cats: 0, vaccinated: 0, sterilized: 0 },
  );
  const vaccineCoverage = totals.pets ? Math.round((totals.vaccinated * 100) / totals.pets) : 0;
  const sterilizationCoverage = totals.pets ? Math.round((totals.sterilized * 100) / totals.pets) : 0;
  const unavailable = Boolean(message) && rows.length === 0;
  const display = (value, suffix = "") => unavailable ? "—" : `${value}${suffix}`;

  return (
    <>
      <PageHead
        eyebrow="รายงานผู้บริหาร"
        title="รายงานทะเบียนสัตว์"
        detail="สรุปสัตว์ขึ้นทะเบียน วัคซีน และการทำหมัน แยกรายหมู่บ้าน"
        actions={<div className="report-actions"><button type="button" className="refresh-btn" onClick={load} disabled={loading}>↻ อัปเดต</button><button type="button" className="export-btn" onClick={() => exportReport("pdf")} disabled={!rows.length || Boolean(exporting)}>{exporting === "pdf" ? "กำลังสร้าง…" : "PDF"}</button><button type="button" className="export-btn" onClick={() => exportReport("xlsx")} disabled={!rows.length || Boolean(exporting)}>{exporting === "xlsx" ? "กำลังสร้าง…" : "XLSX"}</button><button type="button" className="export-btn" onClick={() => exportCsv(rows)} disabled={!rows.length}>CSV</button></div>}
      />
      <section className="report-filter-bar"><label>ข้อมูล ณ วันที่<input type="date" value={cutoff} max={new Date().toISOString().slice(0, 10)} onChange={(event) => { if (event.target.value) setCutoff(event.target.value); }} required /></label><label>พื้นที่<select value={villageId} onChange={(event) => setVillageId(event.target.value)}><option value="">ทุกหมู่บ้าน</option>{villages.map((village) => <option key={village.id} value={village.id}>{village.name}</option>)}</select></label><span>สถิติทางการนับเฉพาะคำขอที่อนุมัติภายในวันตัดยอด</span></section>
      <section className="operational-report-grid" aria-label="ชุดรายงานปฏิบัติการ">{OPERATIONAL_REPORTS.map((report)=><article key={report.type}><div><b>{report.title}</b><span>{report.detail}</span></div><aside>{report.formats.map((format)=>{const key=`${report.type}:${format}`;return <button type="button" key={format} disabled={Boolean(exporting)} onClick={()=>exportOperational(report.type,format)}>{exporting===key?'กำลังสร้าง…':format.toUpperCase()}</button>})}</aside></article>)}</section>
      <Notice message={message} />
      {loading ? <LoadingPanel text="กำลังจัดทำรายงาน…" /> : (
        <>
          <section className="report-stats report-stats-six" aria-label="สรุปรายงาน">
            <StatCard label="สัตว์ขึ้นทะเบียน" value={display(totals.pets)} detail={unavailable ? "รอข้อมูลจาก API" : "ตัว"} />
            <StatCard label="สุนัข" value={display(totals.dogs)} detail={unavailable ? "รอข้อมูลจาก API" : "ตัว"} />
            <StatCard label="แมว" value={display(totals.cats)} detail={unavailable ? "รอข้อมูลจาก API" : "ตัว"} />
            <StatCard label="รับวัคซีน" value={display(vaccineCoverage, "%")} detail={unavailable ? "รอข้อมูลจาก API" : `${totals.vaccinated} ตัว`} tone="green" />
            <StatCard label="ทำหมันแล้ว" value={display(sterilizationCoverage, "%")} detail={unavailable ? "รอข้อมูลจาก API" : `${totals.sterilized} ตัว`} tone="violet" />
            <StatCard label="พื้นที่ครอบคลุม" value={display(rows.length)} detail={unavailable ? "รอข้อมูลจาก API" : "หมู่บ้าน"} />
          </section>
          <article className="panel module-panel report-panel">
            <div className="panel-head"><div><h2>สรุปรายหมู่บ้าน</h2><p>เปรียบเทียบความครอบคลุมบริการของเทศบาลท่าโพธ์</p></div><span className="report-period">ณ {new Date(`${cutoff}T12:00:00`).toLocaleDateString("th-TH")}</span></div>
            {rows.length ? (
              <div className="report-table-wrap"><table className="report-table"><thead><tr><th>หมู่บ้าน</th><th>สัตว์ทั้งหมด</th><th>สุนัข</th><th>แมว</th><th>วัคซีน</th><th>ทำหมัน</th><th>ความครอบคลุมวัคซีน</th></tr></thead><tbody>{rows.map((row) => { const total = Number(row.totalPets || 0); const vaccinated = Number(row.vaccinated || 0); const coverage = total ? Math.round((vaccinated * 100) / total) : 0; return <tr key={row.villageNo}><td><div className="report-village"><i>{row.villageNo}</i><b>{row.villageName}</b></div></td><td><strong>{total}</strong> ตัว</td><td>{Number(row.dogs || 0)}</td><td>{Number(row.cats || 0)}</td><td>{vaccinated}</td><td>{Number(row.sterilized || 0)}</td><td><div className="coverage-cell"><em><strong style={{ width: `${coverage}%` }} /></em><b>{coverage}%</b></div></td></tr>; })}</tbody></table></div>
            ) : (
              <div className="report-empty" role="status"><i aria-hidden="true">▤</i><b>{unavailable ? "ยังไม่สามารถจัดทำรายงานได้" : "ยังไม่มีข้อมูลสำหรับออกรายงาน"}</b><span>{unavailable ? "ตรวจสอบการเชื่อมต่อ API แล้วกดอัปเดตข้อมูล" : "เมื่อมีข้อมูลรายหมู่บ้าน ระบบจะแสดงตารางที่นี่"}</span><button type="button" onClick={load}>ลองโหลดอีกครั้ง</button></div>
            )}
          </article>
        </>
      )}
    </>
  );
}

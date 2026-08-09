import { useEffect } from "react";

export function LoadingState({ label = "กำลังโหลดข้อมูล" }) {
  return <div className="waste-state waste-state--loading" aria-live="polite"><i /><strong>{label}</strong></div>;
}

export function EmptyState({ title, detail, actionLabel, onAction }) {
  return <div className="waste-state waste-state--empty"><span aria-hidden="true">+</span><strong>{title}</strong>{detail ? <p>{detail}</p> : null}{actionLabel && onAction ? <button type="button" className="waste-button waste-button--primary" onClick={onAction}>{actionLabel}</button> : null}</div>;
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return <div className="waste-error" role="alert"><div><strong>ไม่สามารถโหลดข้อมูลได้</strong><p>{error}</p></div>{onRetry ? <button type="button" onClick={onRetry}>ลองอีกครั้ง</button> : null}</div>;
}

const STATUS_LABELS = Object.freeze({
  AVAILABLE: "พร้อมใช้งาน", IN_SERVICE: "กำลังใช้งาน", MAINTENANCE: "ซ่อมบำรุง", OUT_OF_SERVICE: "หยุดใช้งาน",
  SCHEDULED: "ตามแผน", IN_PROGRESS: "กำลังปฏิบัติงาน", COMPLETED: "เสร็จสิ้น", CANCELLED: "ยกเลิก", INTERRUPTED: "หยุดชะงัก",
  REPORTED: "รับแจ้งแล้ว", ACKNOWLEDGED: "กำลังดำเนินการ", RESOLVED: "แก้ไขแล้ว",
  PENDING: "รอชำระ", PAID: "ชำระแล้ว", OVERDUE: "ค้างชำระ", VOID: "ยกเลิก",
  COLLECTED: "เก็บแล้ว", SKIPPED: "ข้ามจุด",
});

export function StatusBadge({ value }) { return <span className={`waste-status waste-status--${String(value || "").toLowerCase()}`}>{STATUS_LABELS[value] || value || "-"}</span>; }

export function PageHead({ eyebrow, title, detail, actions }) {
  return <header className="waste-page-head"><div><p>{eyebrow}</p><h1>{title}</h1>{detail ? <span>{detail}</span> : null}</div>{actions ? <div className="waste-page-head__actions">{actions}</div> : null}</header>;
}

export function Modal({ title, children, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="waste-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="waste-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="ปิด">×</button></header>{children}</section></div>;
}

export function formatNumber(value) { return Number(value || 0).toLocaleString("th-TH"); }
export function formatMoney(value) { return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value || 0)); }
export function formatDate(value, options = { dateStyle: "medium" }) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("th-TH", options).format(date); }
export function toDateInput(value = new Date()) { return new Date(value).toISOString().slice(0, 10); }

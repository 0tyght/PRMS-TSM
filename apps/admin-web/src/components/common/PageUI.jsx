export function PageHead({ eyebrow, title, detail, actions }) {
  return <section className="page-title module-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{detail}</p></div>{actions}</section>;
}

export function EmptyState({ text="ยังไม่มีข้อมูลในส่วนนี้", detail="ข้อมูลใหม่จะแสดงที่นี่โดยอัตโนมัติ" }) {
  return <div className="module-empty"><i>◇</i><b>{text}</b><span>{detail}</span></div>;
}

export function Notice({ message, tone="error" }) {
  return message ? <div className={`module-notice ${tone}`} role="status">{message}</div> : null;
}

export function LoadingPanel({ text="กำลังโหลดข้อมูล…" }) {
  return <article className="panel report-loading"><i/><b>{text}</b><span>กรุณารอสักครู่</span></article>;
}

export function Pagination({ page = 1, hasNext = false, onChange, disabled = false }) {
  if (page <= 1 && !hasNext) return null;
  return <nav className="module-pagination" aria-label="เปลี่ยนหน้ารายการ"><button type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>← ก่อนหน้า</button><span>หน้า {Number(page).toLocaleString("th-TH")}</span><button type="button" disabled={disabled || !hasNext} onClick={() => onChange(page + 1)}>ถัดไป →</button></nav>;
}

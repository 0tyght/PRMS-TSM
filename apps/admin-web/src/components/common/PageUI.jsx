export function PageHead({ eyebrow, title, detail, actions }) {
  return <header className="prms-page-head"><div>{eyebrow ? <p className="prms-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{detail ? <p className="prms-page-detail">{detail}</p> : null}</div>{actions ? <div className="prms-page-actions">{actions}</div> : null}</header>;
}
export function EmptyState({ text = "ยังไม่มีข้อมูลในส่วนนี้", detail = "ข้อมูลใหม่จะแสดงที่นี่โดยอัตโนมัติ" }) {
  return <div className="prms-empty"><span><svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span><strong>{text}</strong><p>{detail}</p></div>;
}
export function Notice({ message, tone = "error" }) {
  return message ? <div className={`prms-notice prms-notice--${tone}`} role="status"><span>{tone === "success" ? "✓" : "!"}</span><p>{message}</p></div> : null;
}
export function LoadingPanel({ text = "กำลังโหลดข้อมูล…" }) {
  return <div className="prms-loading" role="status"><i/><strong>{text}</strong><span>ระบบกำลังเชื่อมต่อข้อมูลล่าสุด</span></div>;
}
export function Pagination({ page = 1, hasNext = false, onChange, disabled = false }) {
  const current = Math.max(1, Number(page) || 1); if (current <= 1 && !hasNext) return null;
  return <nav className="prms-pagination" aria-label="เปลี่ยนหน้ารายการ"><button type="button" disabled={disabled || current <= 1} onClick={() => onChange(current - 1)}>← ก่อนหน้า</button><span>หน้า {current.toLocaleString("th-TH")}</span><button type="button" disabled={disabled || !hasNext} onClick={() => onChange(current + 1)}>ถัดไป →</button></nav>;
}

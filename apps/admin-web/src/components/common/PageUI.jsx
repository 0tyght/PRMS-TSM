export function PageHead({ eyebrow, title, detail, actions }) {
  return (
    <header className="page-title page-title--v2">
      <div className="page-title__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {detail ? <p className="page-title__detail">{detail}</p> : null}
      </div>
      {actions ? <div className="page-title__actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  text = "ยังไม่มีข้อมูลในส่วนนี้",
  detail = "ข้อมูลใหม่จะแสดงที่นี่โดยอัตโนมัติ",
}) {
  return (
    <div className="module-empty module-empty--v2">
      <i aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M4 7h16v12H4z" />
          <path d="M8 7V5h8v2M8 12h8M8 16h5" />
        </svg>
      </i>
      <b>{text}</b>
      <span>{detail}</span>
    </div>
  );
}

export function Notice({ message, tone = "error" }) {
  if (!message) return null;
  return (
    <div className={`module-notice ${tone}`} role="status">
      <span aria-hidden="true">{tone === "success" ? "✓" : "!"}</span>
      <p>{message}</p>
    </div>
  );
}

export function LoadingPanel({ text = "กำลังโหลดข้อมูล…" }) {
  return (
    <div className="report-loading loading-panel-v2" role="status">
      <i aria-hidden="true" />
      <b>{text}</b>
      <span>กรุณารอสักครู่</span>
    </div>
  );
}

export function Pagination({
  page = 1,
  hasNext = false,
  onChange,
  disabled = false,
}) {
  const currentPage = Math.max(1, Number(page) || 1);
  return (
    <nav className="module-pagination" aria-label="แบ่งหน้าข้อมูล">
      <button
        type="button"
        disabled={disabled || currentPage <= 1}
        onClick={() => onChange?.(currentPage - 1)}
      >
        <span aria-hidden="true">←</span> ก่อนหน้า
      </button>
      <span>หน้า {currentPage.toLocaleString("th-TH")}</span>
      <button
        type="button"
        disabled={disabled || !hasNext}
        onClick={() => onChange?.(currentPage + 1)}
      >
        ถัดไป <span aria-hidden="true">→</span>
      </button>
    </nav>
  );
}

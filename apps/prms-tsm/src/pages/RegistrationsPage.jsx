import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPrmsApplication } from "../composition-root/createPrmsApplication.js";
import {
  EmptyState,
  Notice,
  PageHead,
  Pagination,
} from "../components/common/PageUI.jsx";
import { registrationReviewPolicy } from "../domain/RegistrationReviewPolicy.js";

const STATUS_LABELS = {
  SUBMITTED: "รอตรวจสอบ",
  UNDER_REVIEW: "กำลังตรวจ",
  NEED_MORE_INFO: "รอเจ้าของแก้ไข",
  APPROVED: "รับรองแล้ว",
  REJECTED: "ไม่ผ่านการตรวจสอบ",
  CANCELLED: "ยกเลิกแล้ว",
};

const STATUS_TONES = {
  SUBMITTED: "amber",
  UNDER_REVIEW: "blue",
  NEED_MORE_INFO: "rose",
  APPROVED: "green",
  REJECTED: "gray",
  CANCELLED: "gray",
};

const REQUEST_LABELS = {
  REGISTER_PET: "ขึ้นทะเบียนสัตว์เลี้ยง",
  PET_UPDATE: "แก้ไขทะเบียนสัตว์เลี้ยง",
  VACCINATION: "ข้อมูลการรับวัคซีน",
  STERILIZATION: "ข้อมูลการทำหมัน",
  PET_STATUS: "ข้อมูลสถานะสัตว์เลี้ยง",
  OWNER_TRANSFER: "ขอโอนเจ้าของสัตว์เลี้ยง",
};

const FIELD_LABELS = {
  petName: "ชื่อสัตว์เลี้ยง",
  species: "ชนิดสัตว์",
  sex: "เพศ",
  breed: "สายพันธุ์",
  color: "สี/ตำหนิ",
  birthDate: "วันเกิด",
  microchipNo: "หมายเลขไมโครชิป",
  reason: "เหตุผล",
  vaccineName: "ชนิดวัคซีน",
  vaccinatedAt: "วันที่รับวัคซีน",
  nextDueAt: "กำหนดครั้งถัดไป",
  lotNo: "เลขล็อต",
  providerName: "สถานที่/ผู้ให้บริการ",
  sterilizedAt: "วันที่ทำหมัน",
  note: "หมายเหตุ",
  status: "สถานะสัตว์เลี้ยง",
  effectiveAt: "วันที่มีผล",
  newOwnerName: "ชื่อเจ้าของใหม่",
  newOwnerPhone: "เบอร์โทรเจ้าของใหม่",
  newHouseNo: "บ้านเลขที่เจ้าของใหม่",
  newVillageId: "หมู่บ้านเจ้าของใหม่",
  newVillageNo: "เลขหมู่เจ้าของใหม่",
  newAddressDetail: "รายละเอียดที่อยู่เจ้าของใหม่",
  newLatitude: "ละติจูดเจ้าของใหม่",
  newLongitude: "ลองจิจูดเจ้าของใหม่",
  transferredAt: "วันที่โอนเจ้าของ",
  additionalInfo: "ข้อมูลเพิ่มเติมจากประชาชน",
};

const SPECIES_LABELS = { DOG: "สุนัข", CAT: "แมว" };
const SEX_LABELS = { MALE: "เพศผู้", FEMALE: "เพศเมีย", UNKNOWN: "ไม่ระบุ" };

function formatThaiDate(value, time = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function displayValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "species") return SPECIES_LABELS[value] || value;
  if (field === "sex") return SEX_LABELS[value] || value;
  if (field === "status") return ({ ACTIVE: "ปกติ", MISSING: "สูญหาย", DECEASED: "เสียชีวิต", TRANSFERRED: "โอนเจ้าของ", MOVED_OUT: "ย้ายออกจากพื้นที่" })[value] || value;
  if (["birthDate", "vaccinatedAt", "nextDueAt", "sterilizedAt", "effectiveAt", "transferredAt"].includes(field)) {
    return formatThaiDate(value);
  }
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่";
  return String(value);
}

function ageLabel(item) {
  return registrationReviewPolicy.ageLabel(item);
}

function isUrgent(item) {
  return registrationReviewPolicy.isUrgent(item);
}

function sourceLabel(item) {
  return registrationReviewPolicy.sourceLabel(item);
}

function Icon({ name }) {
  const paths = {
    filter: <path d="M4 5h16M7 12h10M10 19h4" />,
    refresh: <><path d="M20 6v5h-5M4 18v-5h5" /><path d="M6 8a7 7 0 0 1 12-2l2 5M18 16a7 7 0 0 1-12 2l-2-5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    line: <><rect x="3" y="4" width="18" height="14" rx="5" /><path d="M8 9h8M8 13h5M9 18l-2 3" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.search}
    </svg>
  );
}

function SummaryCard({ label, value, detail, tone }) {
  return (
    <article className={`inbox-summary inbox-summary--${tone}`}>
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString("th-TH")}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inbox-status inbox-status--${STATUS_TONES[status] || "gray"}`}>
      {STATUS_LABELS[status] || status || "ไม่ระบุ"}
    </span>
  );
}

function QueueItem({ item, active, busy, onOpen, onStart }) {
  return (
    <article className={`inbox-row ${active ? "is-active" : ""}`}>
      <button type="button" className="inbox-row__main" onClick={onOpen}>
        <span className={`inbox-row__pet ${item.species === "DOG" ? "dog" : "cat"}`}>
          {item.species === "DOG" ? "ส" : "ม"}
        </span>
        <span className="inbox-row__copy">
          <span className="inbox-row__meta">
            <em className={item.sourceType === "CITIZEN_SUBMISSION" ? "is-line" : ""}>
              {sourceLabel(item)}
            </em>
            {isUrgent(item) ? <b>เร่งด่วน</b> : null}
          </span>
          <strong>{item.petName || "ไม่ระบุชื่อสัตว์"}</strong>
          <small>{item.ownerName || "ไม่ระบุเจ้าของ"} · หมู่ {item.villageNo || "—"}</small>
          <span>{REQUEST_LABELS[item.requestType] || item.requestType}</span>
        </span>
        <span className="inbox-row__side">
          <StatusBadge status={item.status} />
          <small>{ageLabel(item)}</small>
          <Icon name="arrow" />
        </span>
      </button>

      {item.status !== "UNDER_REVIEW" && !registrationReviewPolicy.isClosed(item.status) ? (
        <button
          type="button"
          className="inbox-row__start"
          disabled={Boolean(busy)}
          onClick={onStart}
        >
          รับตรวจ
        </button>
      ) : null}
    </article>
  );
}

function InfoGrid({ entries }) {
  return (
    <dl className="inbox-info-grid">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function RegistrationDetail({ detail, onDownload }) {
  const proposed = detail.proposed || {};
  return (
    <>
      <section className="inbox-detail-section">
        <h3>ข้อมูลเจ้าของและที่อยู่</h3>
        <InfoGrid
          entries={[
            ["ชื่อ–นามสกุล", proposed.ownerName],
            ["โทรศัพท์", proposed.phone],
            ["บ้านเลขที่", proposed.houseNo],
            ["หมู่บ้าน", proposed.villageNo ? `หมู่ ${proposed.villageNo} ${proposed.villageName || ""}` : "—"],
            ["รายละเอียดที่อยู่", proposed.addressDetail],
            ["ตำแหน่งบ้าน", proposed.latitude != null && proposed.longitude != null ? `${Number(proposed.latitude).toFixed(7)}, ${Number(proposed.longitude).toFixed(7)}` : "ยังไม่มีพิกัด"],
            ["การเชื่อม LINE", detail.lineUserId ? "เชื่อมบัญชีแล้ว" : "ยังไม่เชื่อม"],
          ]}
        />
      </section>

      <section className="inbox-detail-section">
        <h3>ข้อมูลสัตว์เลี้ยงที่เสนอ</h3>
        <InfoGrid
          entries={[
            ["ชื่อสัตว์เลี้ยง", proposed.petName],
            ["ชนิด", SPECIES_LABELS[proposed.species] || proposed.species],
            ["เพศ", SEX_LABELS[proposed.sex] || proposed.sex],
            ["สายพันธุ์", proposed.breed],
            ["สี/ตำหนิ", proposed.color],
            ["วันเกิดโดยประมาณ", formatThaiDate(proposed.birthDate)],
          ]}
        />
      </section>

      <section className="inbox-detail-section">
        <div className="inbox-detail-section__head">
          <h3>หลักฐานประกอบ</h3>
          <span>{(detail.attachments || []).length} ไฟล์</span>
        </div>
        {(detail.attachments || []).length ? (
          <div className="inbox-files">
            {detail.attachments.map((file) => (
              <button type="button" key={file.id} onClick={() => onDownload(file)}>
                <span>
                  <strong>{file.fileName}</strong>
                  <small>{file.mimeType} · {Math.ceil(Number(file.fileSize || 0) / 1024).toLocaleString("th-TH")} KB</small>
                </span>
                <b>เปิดไฟล์</b>
              </button>
            ))}
          </div>
        ) : (
          <p className="inbox-inline-note">ไม่มีไฟล์แนบ โปรดตรวจสอบข้อมูลกับเจ้าของสัตว์เลี้ยงก่อนรับรอง</p>
        )}
      </section>
    </>
  );
}

function ChangeDetail({ detail, onDownload }) {
  const current = detail.current || {};
  const proposed = detail.proposed || {};
  const fields = Array.from(new Set([...Object.keys(current), ...Object.keys(proposed)]));
  const attachments = Array.isArray(detail.attachments) ? detail.attachments : [];

  return (
    <>
      <section className="inbox-detail-section">
        <div className="inbox-detail-section__head">
          <h3>เปรียบเทียบข้อมูลเดิมและข้อมูลที่เสนอ</h3>
          <span>{fields.length} รายการ</span>
        </div>
        {fields.length ? (
          <div className="inbox-diff">
            <div className="inbox-diff__head">
              <span>รายการ</span>
              <span>ข้อมูลเดิม</span>
              <span>ข้อมูลที่เสนอ</span>
            </div>
            {fields.map((field) => {
              const before = displayValue(field, current[field]);
              const after = displayValue(field, proposed[field]);
              const changed = before !== after;
              return (
                <div className={changed ? "is-changed" : ""} key={field}>
                  <strong>{FIELD_LABELS[field] || field}</strong>
                  <span>{before}</span>
                  <span>{after}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="inbox-inline-note">ไม่พบข้อมูลเดิมสำหรับเปรียบเทียบในรายการนี้</p>
        )}
      </section>
      <section className="inbox-detail-section">
        <div className="inbox-detail-section__head">
          <h3>หลักฐานจาก LINE</h3>
          <span>{attachments.length} ไฟล์</span>
        </div>
        {attachments.length ? (
          <div className="inbox-files">
            {attachments.map((file) => (
              <button type="button" key={file.id} onClick={() => onDownload(file)}>
                <span>
                  <strong>{file.fileName}</strong>
                  <small>{file.mimeType} · {Math.ceil(Number(file.fileSize || 0) / 1024).toLocaleString("th-TH")} KB</small>
                </span>
                <b>เปิดไฟล์</b>
              </button>
            ))}
          </div>
        ) : (
          <p className="inbox-inline-note">ไม่มีรูปหรือหลักฐานแนบมากับรายการนี้</p>
        )}
      </section>
    </>
  );
}
function DetailPanel({
  item,
  detail,
  loading,
  busy,
  decision,
  setDecision,
  note,
  setNote,
  onClose,
  onSubmit,
  onDownload,
}) {
  const closed = detail ? registrationReviewPolicy.isClosed(detail.status) : false;
  const noteRequired = ["NEED_MORE_INFO", "REJECTED"].includes(decision);

  return (
    <aside className={`inbox-detail ${item ? "is-open" : ""}`} aria-label="รายละเอียดข้อมูล">
      {!item ? (
        <div className="inbox-detail-empty">
          <span><Icon name="line" /></span>
          <strong>เลือกข้อมูลเพื่อตรวจสอบ</strong>
          <p>รายละเอียดข้อมูลที่ส่งจาก LINE จะแสดงในพื้นที่นี้</p>
        </div>
      ) : (
        <>
          <header className="inbox-detail-head">
            <div>
              <span>{sourceLabel(item)}</span>
              <h2>{item.referenceNo || "ไม่ระบุเลขอ้างอิง"}</h2>
              <p>{REQUEST_LABELS[item.requestType] || item.requestType}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="ปิดรายละเอียด"><Icon name="close" /></button>
          </header>

          {loading ? (
            <div className="prms-loading"><i /><strong>กำลังโหลดรายละเอียด</strong></div>
          ) : detail ? (
            <>
              <div className="inbox-detail-summary">
                <span className={`inbox-detail-pet ${detail.species === "DOG" ? "dog" : "cat"}`}>
                  {detail.species === "DOG" ? "ส" : "ม"}
                </span>
                <div>
                  <strong>{detail.petName || detail.proposed?.petName || "ไม่ระบุชื่อสัตว์"}</strong>
                  <small>{detail.ownerName || detail.proposed?.ownerName || "ไม่ระบุเจ้าของ"} · หมู่ {detail.villageNo || detail.proposed?.villageNo || "—"}</small>
                </div>
                <StatusBadge status={detail.status} />
              </div>

              <div className="inbox-detail-scroll">
                <section className="inbox-detail-section inbox-detail-timeline">
                  <h3>ข้อมูลที่ส่งให้ตรวจสอบ</h3>
                  <InfoGrid
                    entries={[
                      ["ส่งข้อมูลเมื่อ", formatThaiDate(detail.submittedAt, true)],
                      ["ผู้ตรวจล่าสุด", detail.reviewerName || "ยังไม่มีผู้ตรวจ"],
                      ["ตรวจล่าสุด", formatThaiDate(detail.reviewedAt, true)],
                      ["หมายเหตุเดิม", detail.reviewNote || "ไม่มี"],
                    ]}
                  />
                </section>

                {item.requestType === "REGISTER_PET" ? (
                  <RegistrationDetail detail={detail} onDownload={onDownload} />
                ) : (
                  <ChangeDetail detail={detail} onDownload={onDownload} />
                )}
              </div>

              {!closed ? (
                <form className="inbox-decision" onSubmit={onSubmit}>
                  <label>
                    ผลการตรวจ
                    <select value={decision} onChange={(event) => setDecision(event.target.value)} required>
                      <option value="">เลือกการดำเนินการ</option>
                      {detail.status !== "UNDER_REVIEW" ? <option value="UNDER_REVIEW">รับเข้าตรวจสอบ</option> : null}
                      <option value="NEED_MORE_INFO">ส่งกลับให้เจ้าของแก้ไข</option>
                      <option value="APPROVED">รับรองข้อมูล</option>
                      <option value="REJECTED">ไม่ผ่านการตรวจสอบ</option>
                    </select>
                  </label>
                  <label>
                    หมายเหตุถึงเจ้าของสัตว์เลี้ยง
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      required={noteRequired}
                      placeholder={noteRequired ? "ระบุสาเหตุหรือสิ่งที่ต้องแก้ไขอย่างชัดเจน" : "เพิ่มหมายเหตุเมื่อจำเป็น"}
                      rows="3"
                      maxLength="500"
                    />
                  </label>
                  <div className="inbox-decision__foot">
                    <span>
                      {item.sourceType === "CITIZEN_SUBMISSION"
                        ? "ระบบจะส่งผลการตรวจกลับผ่าน LINE"
                        : detail.lineUserId
                          ? "เจ้าของเชื่อม LINE แล้ว ระบบจะส่งผลกลับอัตโนมัติ"
                          : "ผลการตรวจจะบันทึกในระบบติดตาม"}
                    </span>
                    <button type="submit" disabled={Boolean(busy) || !decision}>
                      {busy ? "กำลังบันทึก…" : "ยืนยันผลการตรวจ"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="inbox-closed-note">ข้อมูลนี้สิ้นสุดกระบวนการตรวจสอบแล้ว</div>
              )}
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}

export default function RegistrationsPage({ token }) {
  const api = useMemo(() => createPrmsApplication(token), [token]);
  const sequence = useRef(0);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [villages, setVillages] = useState([]);
  const [pageMeta, setPageMeta] = useState({ page: 1, hasNext: false });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING");
  const [type, setType] = useState("");
  const [villageId, setVillageId] = useState("");
  const [sort, setSort] = useState("urgent");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const requestId = sequence.current + 1;
    sequence.current = requestId;
    setLoading(true);
    setMessage("");

    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        status,
        sort,
      });
      if (type) query.set("requestType", type);
      if (villageId) query.set("villageId", villageId);
      if (search) query.set("search", search);

      const response = await api.getPage(`/api/admin/review-queue?${query}`);
      if (requestId !== sequence.current) return;

      setRows(Array.isArray(response?.data) ? response.data : []);
      setSummary(response?.summary || {});
      setPageMeta(response?.meta || { page, hasNext: false });
    } catch (error) {
      if (requestId !== sequence.current) return;
      setRows([]);
      setSummary({});
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดศูนย์รับข้อมูลได้");
    } finally {
      if (requestId === sequence.current) setLoading(false);
    }
  }, [api, page, search, sort, status, type, villageId]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    api.get("/api/public/villages")
      .then((data) => {
        if (active) setVillages(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setVillages([]);
      });
    return () => {
      active = false;
    };
  }, [api]);

  async function openDetail(item) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    setDecision("");
    setNote("");
    setMessage("");

    try {
      const data = item.requestType === "REGISTER_PET"
        ? await api.get(`/api/admin/registrations/${item.id}`)
        : await api.get(`/api/admin/citizen-submissions/${item.id}`);
      setDetail(data);
      setNote(data?.reviewNote || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดรายละเอียดข้อมูลได้");
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateStatus(item, nextStatus, reviewNote = "") {
    setBusy(`${item.id}:${nextStatus}`);
    setMessage("");

    try {
      if (item.requestType === "REGISTER_PET") {
        await api.patch(`/api/admin/registrations/${item.id}/status`, {
          status: nextStatus,
          note: reviewNote,
          version: Number(detail?.version ?? item.version),
        });
      } else {
        await api.patch(`/api/admin/citizen-submissions/${item.id}/status`, {
          status: nextStatus,
          note: reviewNote,
          version: Number(detail?.version ?? item.version),
        });
      }
      setSelected(null);
      setDetail(null);
      setDecision("");
      setNote("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถบันทึกผลการตรวจสอบได้");
    } finally {
      setBusy("");
    }
  }

  async function startReview(item) {
    if (item.status === "UNDER_REVIEW" || registrationReviewPolicy.isClosed(item.status)) return;
    await updateStatus(item, "UNDER_REVIEW");
  }

  async function download(file) {
    setMessage("");
    try {
      await api.download(`/api/admin/attachments/${file.id}`, file.fileName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถเปิดไฟล์หลักฐานได้");
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function submitDecision(event) {
    event.preventDefault();
    if (!selected || !decision) return;
    if (["NEED_MORE_INFO", "REJECTED"].includes(decision) && !note.trim()) {
      setMessage("กรุณาระบุเหตุผลหรือข้อมูลที่ต้องแก้ไขก่อนส่งผลกลับเจ้าของสัตว์เลี้ยง");
      return;
    }
    void updateStatus(selected, decision, note.trim());
  }

  const pendingTotal =
    Number(summary.submitted || 0) +
    Number(summary.underReview || 0) +
    Number(summary.needMoreInfo || 0);

  return (
    <div className="inbox-page">
      <PageHead
        eyebrow="Citizen Data Operations"
        title="ศูนย์รับข้อมูลจากประชาชน"
        detail="รวมข้อมูลขึ้นทะเบียน แก้ไขทะเบียน วัคซีน ทำหมัน สถานะสัตว์ และการโอนเจ้าของที่ประชาชนส่งผ่าน LINE Official Account"
        actions={
          <>
            <button type="button" className="prms-button prms-button--ghost" onClick={() => setShowFilters((value) => !value)}>
              <Icon name="filter" />
              <span>{showFilters ? "ซ่อนตัวกรอง" : "ตัวกรอง"}</span>
            </button>
            <button type="button" className="prms-button prms-button--primary" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh" />
              <span>{loading ? "กำลังโหลด" : "โหลดข้อมูลใหม่"}</span>
            </button>
          </>
        }
      />

      <Notice message={message} />

      <section className="inbox-summary-grid">
        <SummaryCard label="งานที่ยังไม่เสร็จ" value={pendingTotal} detail="ข้อมูลจาก LINE Official Account" tone="primary" />
        <SummaryCard label="รอตรวจสอบ" value={summary.submitted} detail="ยังไม่มีเจ้าหน้าที่รับงาน" tone="amber" />
        <SummaryCard label="กำลังตรวจ" value={summary.underReview} detail="อยู่ระหว่างตรวจข้อมูลและหลักฐาน" tone="blue" />
        <SummaryCard label="รอเจ้าของแก้ไข" value={summary.needMoreInfo} detail="แจ้งผลกลับผ่าน LINE แล้ว" tone="rose" />
        <SummaryCard label="เร่งด่วน" value={summary.urgent} detail="รอตรวจตั้งแต่ 3 วันขึ้นไป" tone="danger" />
      </section>

      <form className="inbox-searchbar" onSubmit={submitSearch}>
        <div className="inbox-searchbox">
          <Icon name="search" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ค้นหาเลขอ้างอิง ชื่อเจ้าของ หรือชื่อสัตว์เลี้ยง"
          />
          {searchInput ? (
            <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setPage(1); }} aria-label="ล้างคำค้น">×</button>
          ) : null}
        </div>
        <button type="submit" className="prms-button prms-button--primary">ค้นหา</button>
      </form>

      {showFilters ? (
        <section className="inbox-filter-panel">
          <label>
            สถานะงาน
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="PENDING">งานที่ยังไม่เสร็จ</option>
              <option value="">ทุกสถานะ</option>
              <option value="SUBMITTED">รอตรวจสอบ</option>
              <option value="UNDER_REVIEW">กำลังตรวจ</option>
              <option value="NEED_MORE_INFO">รอเจ้าของแก้ไข</option>
              <option value="APPROVED">รับรองแล้ว</option>
              <option value="REJECTED">ไม่ผ่านการตรวจสอบ</option>
              <option value="CANCELLED">ยกเลิกแล้ว</option>
            </select>
          </label>
          <label>
            ประเภทข้อมูล
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
              <option value="">ทุกประเภท</option>
              {Object.entries(REQUEST_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            หมู่บ้าน
            <select value={villageId} onChange={(event) => { setVillageId(event.target.value); setPage(1); }}>
              <option value="">ทุกหมู่บ้าน</option>
              {villages.map((village) => (
                <option key={village.id} value={village.id}>
                  หมู่ {village.villageNo} {village.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            เรียงลำดับ
            <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="urgent">เร่งด่วนก่อน</option>
              <option value="oldest">เก่าก่อน</option>
              <option value="newest">ใหม่ก่อน</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setStatus("PENDING");
              setType("");
              setVillageId("");
              setSort("urgent");
              setSearchInput("");
              setSearch("");
              setPage(1);
            }}
          >
            คืนค่าเริ่มต้น
          </button>
        </section>
      ) : null}

      <section className={`inbox-workspace ${selected ? "has-detail" : ""}`}>
        <div className="inbox-queue">
          <header className="inbox-queue-head">
            <div>
              <span>คิวตรวจสอบ</span>
              <h2>{Number(summary.total || rows.length).toLocaleString("th-TH")} รายการ</h2>
            </div>
            <p>เลือกข้อมูลเพื่อดูรายละเอียดและบันทึกผลการตรวจ</p>
          </header>

          {loading ? (
            <div className="prms-loading"><i /><strong>กำลังโหลดคิวข้อมูล</strong></div>
          ) : rows.length ? (
            <div className="inbox-list">
              {rows.map((item) => (
                <QueueItem
                  key={`${item.sourceType}:${item.id}`}
                  item={item}
                  active={selected?.id === item.id && selected?.sourceType === item.sourceType}
                  busy={busy}
                  onOpen={() => void openDetail(item)}
                  onStart={() => void startReview(item)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              text="ไม่พบข้อมูลตามเงื่อนไข"
              detail="ลองเปลี่ยนสถานะ ประเภทข้อมูล หมู่บ้าน หรือคำค้นหา"
            />
          )}

          <Pagination
            page={Number(pageMeta.page || page)}
            hasNext={Boolean(pageMeta.hasNext)}
            disabled={loading || Boolean(busy)}
            onChange={setPage}
          />
        </div>

        <DetailPanel
          item={selected}
          detail={detail}
          loading={detailLoading}
          busy={busy}
          decision={decision}
          setDecision={setDecision}
          note={note}
          setNote={setNote}
          onClose={() => { setSelected(null); setDetail(null); }}
          onSubmit={submitDecision}
          onDownload={download}
        />
      </section>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createApi } from "../lib/api.js";
import {
  EmptyState,
  Notice,
  PageHead,
  Pagination,
} from "../components/common/PageUI.jsx";

const STATUS_LABELS = {
  SUBMITTED: "รอตรวจสอบ",
  UNDER_REVIEW: "กำลังตรวจ",
  NEED_MORE_INFO: "รอเจ้าของแก้ไข",
  APPROVED: "รับรองแล้ว",
  REJECTED: "ไม่ผ่านการตรวจสอบ",
  CANCELLED: "ยกเลิกแล้ว",
};
const REQUEST_LABELS = {
  REGISTER_PET: "ขึ้นทะเบียนสัตว์เลี้ยง",
  PET_UPDATE: "แก้ไขทะเบียนสัตว์เลี้ยง",
  VACCINATION: "ข้อมูลการรับวัคซีน",
  STERILIZATION: "ข้อมูลการทำหมัน",
  PET_STATUS: "ข้อมูลสถานะสัตว์เลี้ยง",
};
const SPECIES_LABELS = { DOG: "สุนัข", CAT: "แมว" };
const SEX_LABELS = { MALE: "เพศผู้", FEMALE: "เพศเมีย", UNKNOWN: "ไม่ระบุ" };
const FIELD_LABELS = {
  petName: "ชื่อสัตว์เลี้ยง",
  species: "ชนิด",
  sex: "เพศ",
  breed: "สายพันธุ์",
  color: "สี/ตำหนิ",
  birthDate: "วันเกิด",
  microchipNo: "ไมโครชิป",
  reason: "เหตุผล",
  vaccineName: "วัคซีน",
  vaccinatedAt: "วันที่ฉีด",
  nextDueAt: "กำหนดครั้งถัดไป",
  lotNo: "เลขล็อต",
  providerName: "สถานที่/ผู้ให้บริการ",
  sterilizedAt: "วันที่ทำหมัน",
  note: "หมายเหตุ",
  status: "สถานะ",
  effectiveAt: "วันที่มีผล",
};
const CLOSED_STATUSES = ["APPROVED", "REJECTED", "CANCELLED"];

function maskNationalId(value) {
  if (!value) return "ไม่ระบุ";
  return `x-xxxx-xxxxx-${String(value).slice(-2)}-x`;
}

function formatThaiDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function getStatusTone(status) {
  if (status === "APPROVED") return "green";
  if (["REJECTED", "CANCELLED"].includes(status)) return "gray";
  return "amber";
}

function getAgeLabel(item) {
  const days = Number(item.ageDays || 0);
  if (days <= 0) return "วันนี้";
  if (days === 1) return "1 วัน";
  return `${days.toLocaleString("th-TH")} วัน`;
}

function isUrgent(item) {
  return Number(item.ageDays || 0) >= 3 && item.status === "SUBMITTED";
}

function SummaryCard({ label, value, detail }) {
  return (
    <article className="panel review-summary-card">
      <span style={{ color: "var(--muted, #6d817a)", fontSize: "13px" }}>{label}</span>
      <strong style={{ display: "block", marginTop: "8px", fontSize: "28px" }}>
        {Number(value || 0).toLocaleString("th-TH")}
      </strong>
      <small style={{ display: "block", marginTop: "4px", color: "var(--muted, #6d817a)" }}>
        {detail}
      </small>
    </article>
  );
}

export default function RegistrationsPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const requestSequence = useRef(0);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [requestType, setRequestType] = useState("");
  const [villages, setVillages] = useState([]);
  const [villageId, setVillageId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("urgent");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ page: 1, hasNext: false });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [registrationDetail, setRegistrationDetail] = useState(null);
  const [changeDetail, setChangeDetail] = useState(null);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setMessage("");
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: "50",
        status: statusFilter,
        sort,
      });
      if (requestType) query.set("requestType", requestType);
      if (villageId) query.set("villageId", villageId);
      if (dateFrom) query.set("dateFrom", dateFrom);
      if (dateTo) query.set("dateTo", dateTo);
      if (search) query.set("search", search);
      const response = await api.getPage(`/api/admin/review-queue?${query}`);
      if (requestId !== requestSequence.current) return;
      setRows(Array.isArray(response?.data) ? response.data : []);
      setSummary(response?.summary || {});
      setPageMeta(response?.meta || { page, hasNext: false });
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setRows([]);
      setSummary({});
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดคิวข้อมูลรอตรวจสอบได้");
    }
  }, [api, dateFrom, dateTo, page, requestType, search, sort, statusFilter, villageId]);

  useEffect(() => {
    let active = true;
    api.get("/api/public/villages")
      .then((data) => { if (active) setVillages(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setVillages([]); });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  function resetDecision(detail) {
    setDecision("");
    setNote(detail?.reviewNote || "");
  }

  async function openQueueDetail(item) {
    setDetailLoading(true);
    setMessage("");
    try {
      if (item.requestType === "REGISTER_PET") {
        const data = await api.get(`/api/admin/registrations/${item.id}`);
        setRegistrationDetail(data);
        setChangeDetail(null);
        resetDecision(data);
      } else {
        const data = await api.get(`/api/admin/citizen-submissions/${item.id}`);
        setChangeDetail(data);
        setRegistrationDetail(null);
        resetDecision(data);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดรายละเอียดข้อมูลได้");
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateRegistrationStatus(id, status, reviewNote = "") {
    setBusy(`${id}:${status}`);
    setMessage("");
    try {
      await api.patch(`/api/admin/registrations/${id}/status`, {
        status,
        note: reviewNote,
      });
      setRegistrationDetail(null);
      setDecision("");
      setNote("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถบันทึกผลการตรวจสอบได้");
    } finally {
      setBusy("");
    }
  }

  async function updateCitizenStatus(item, status, reviewNote = "") {
    setBusy(`${item.id}:${status}`);
    setMessage("");
    try {
      await api.patch(`/api/admin/citizen-submissions/${item.id}/status`, {
        status,
        note: reviewNote,
        version: item.version,
      });
      setChangeDetail(null);
      setDecision("");
      setNote("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถบันทึกผลการตรวจสอบได้");
    } finally {
      setBusy("");
    }
  }

  async function markUnderReview(item) {
    if (item.status === "UNDER_REVIEW" || CLOSED_STATUSES.includes(item.status)) return;
    if (item.requestType === "REGISTER_PET") {
      await updateRegistrationStatus(item.id, "UNDER_REVIEW");
      return;
    }
    await updateCitizenStatus(item, "UNDER_REVIEW");
  }

  async function downloadAttachment(file) {
    setMessage("");
    try {
      await api.download(`/api/admin/attachments/${file.id}`, file.fileName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถดาวน์โหลดไฟล์หลักฐานได้");
    }
  }

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <>
      <PageHead
        eyebrow="งานตรวจสอบข้อมูล"
        title="ข้อมูลที่รอตรวจสอบ"
        detail="รวมข้อมูลขึ้นทะเบียนและข้อมูลเปลี่ยนแปลงจาก LINE เพื่อจัดลำดับ ตรวจสอบ ส่งกลับแก้ไข หรือรับรองเข้าสู่ทะเบียนทางการ"
        actions={
          <button type="button" onClick={() => void load()} disabled={detailLoading || Boolean(busy)}>
            โหลดข้อมูลใหม่
          </button>
        }
      />

      <Notice message={message} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <SummaryCard label="รอตรวจสอบ" value={summary.submitted} detail="ข้อมูลใหม่ที่ยังไม่มีผู้รับตรวจ" />
        <SummaryCard label="กำลังตรวจ" value={summary.underReview} detail="ข้อมูลที่เจ้าหน้าที่กำลังดำเนินการ" />
        <SummaryCard label="รอแก้ไข" value={summary.needMoreInfo} detail="ส่งกลับให้เจ้าของเพิ่มหรือแก้ข้อมูล" />
        <SummaryCard label="เร่งด่วน" value={summary.urgent} detail="รอตรวจตั้งแต่ 3 วันขึ้นไป" />
      </section>

      <article className="panel module-panel review-filter-panel">
        <form
          onSubmit={applySearch}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "10px",
            alignItems: "end",
          }}
        >
          <label>
            ค้นหาข้อมูล
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="เลขอ้างอิง ชื่อเจ้าของ หรือชื่อสัตว์"
            />
          </label>
          <label>
            สถานะงาน
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
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
            <select
              value={requestType}
              onChange={(event) => {
                setRequestType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทุกประเภท</option>
              {Object.entries(REQUEST_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            หมู่บ้าน
            <select
              value={villageId}
              onChange={(event) => {
                setVillageId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทุกหมู่บ้าน</option>
              {villages.map((village) => (
                <option key={village.id} value={village.id}>
                  หมู่ {village.villageNo} {village.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            ตั้งแต่วันที่
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => { setDateFrom(event.target.value); setPage(1); }}
              max={dateTo || undefined}
            />
          </label>
          <label>
            ถึงวันที่
            <input
              type="date"
              value={dateTo}
              onChange={(event) => { setDateTo(event.target.value); setPage(1); }}
              min={dateFrom || undefined}
            />
          </label>
          <label>
            เรียงลำดับ
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="urgent">เร่งด่วนก่อน</option>
              <option value="oldest">เก่าก่อน</option>
              <option value="newest">ใหม่ก่อน</option>
            </select>
          </label>
          <button type="submit">ค้นหา</button>
        </form>
      </article>

      <article className="panel module-panel">
        <div className="panel-head">
          <div>
            <h2>คิวงานตรวจสอบ</h2>
            <p>รายการจากทะเบียนใหม่ วัคซีน ทำหมัน แก้ไขทะเบียน และการเปลี่ยนสถานะสัตว์เลี้ยง</p>
          </div>
          <span className="badge amber">{Number(summary.total || 0).toLocaleString("th-TH")} รายการ</span>
        </div>
        {rows.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ความเร่งด่วน</th>
                    <th>เลขอ้างอิง / ประเภท</th>
                    <th>เจ้าของ / สัตว์เลี้ยง</th>
                    <th>หมู่</th>
                    <th>ส่งเมื่อ</th>
                    <th>สถานะ</th>
                    <th>ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={`${item.sourceType}:${item.id}`}>
                      <td>
                        <span className={`badge ${isUrgent(item) ? "amber" : "gray"}`}>
                          {isUrgent(item) ? `เร่งด่วน · ${getAgeLabel(item)}` : getAgeLabel(item)}
                        </span>
                      </td>
                      <td>
                        <b>{item.referenceNo || "—"}</b>
                        <small style={{ display: "block", marginTop: "4px" }}>
                          {REQUEST_LABELS[item.requestType] || item.requestType}
                        </small>
                      </td>
                      <td>
                        <div className="pet-cell">
                          <i>{item.species === "DOG" ? "ส" : "ม"}</i>
                          <span>
                            <b>{item.petName || "ไม่ระบุชื่อ"}</b>
                            <small>{item.ownerName || "ไม่ระบุเจ้าของ"}</small>
                          </span>
                        </div>
                      </td>
                      <td>{item.villageNo || "—"}</td>
                      <td>{formatThaiDate(item.submittedAt, true)}</td>
                      <td>
                        <span className={`badge ${getStatusTone(item.status)}`}>
                          {STATUS_LABELS[item.status] || item.status || "ไม่ระบุ"}
                        </span>
                      </td>
                      <td>
                        <div className="action-group">
                          <button
                            type="button"
                            disabled={detailLoading || Boolean(busy)}
                            onClick={() => void openQueueDetail(item)}
                          >
                            ตรวจรายละเอียด
                          </button>
                          {item.status !== "UNDER_REVIEW" && !CLOSED_STATUSES.includes(item.status) ? (
                            <button
                              type="button"
                              disabled={detailLoading || Boolean(busy)}
                              onClick={() => void markUnderReview(item)}
                            >
                              รับตรวจ
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={Number(pageMeta.page || page)}
              hasNext={Boolean(pageMeta.hasNext)}
              onChange={setPage}
              disabled={detailLoading || Boolean(busy)}
            />
          </>
        ) : (
          <EmptyState text="ไม่มีข้อมูลตรงกับเงื่อนไขที่เลือก" />
        )}
      </article>

      {registrationDetail ? (
        <div className="modal-backdrop registration-backdrop" role="presentation">
          <section className="registration-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-detail-title">
            <header className="registration-dialog-head">
              <div>
                <p className="eyebrow">ข้อมูล {registrationDetail.referenceNo}</p>
                <h2 id="registration-detail-title">ตรวจข้อมูลก่อนรับรองเข้าทะเบียน</h2>
                <span className={`badge ${getStatusTone(registrationDetail.status)}`}>
                  {STATUS_LABELS[registrationDetail.status] || registrationDetail.status}
                </span>
              </div>
              <button type="button" aria-label="ปิด" onClick={() => setRegistrationDetail(null)}>×</button>
            </header>
            <div className="registration-review-grid">
              <article>
                <h3>ข้อมูลเจ้าของที่เสนอ</h3>
                <dl>
                  <div><dt>ชื่อ–นามสกุล</dt><dd>{registrationDetail.proposed.ownerName}</dd></div>
                  <div><dt>โทรศัพท์</dt><dd>{registrationDetail.proposed.phone}</dd></div>
                  <div><dt>เลขบัตรประชาชน</dt><dd>{maskNationalId(registrationDetail.proposed.nationalId)}</dd></div>
                  <div><dt>ที่อยู่</dt><dd>บ้านเลขที่ {registrationDetail.proposed.houseNo} หมู่ {registrationDetail.proposed.villageNo} {registrationDetail.proposed.villageName}</dd></div>
                  <div><dt>รายละเอียด</dt><dd>{registrationDetail.proposed.addressDetail || "—"}</dd></div>
                </dl>
              </article>
              <article>
                <h3>ข้อมูลสัตว์ที่เสนอ</h3>
                <dl>
                  <div><dt>ชื่อสัตว์</dt><dd>{registrationDetail.proposed.petName}</dd></div>
                  <div><dt>ชนิด / เพศ</dt><dd>{SPECIES_LABELS[registrationDetail.proposed.species]} · {SEX_LABELS[registrationDetail.proposed.sex]}</dd></div>
                  <div><dt>พันธุ์</dt><dd>{registrationDetail.proposed.breed || "ไม่ระบุ"}</dd></div>
                  <div><dt>สี</dt><dd>{registrationDetail.proposed.color || "ไม่ระบุ"}</dd></div>
                  <div><dt>วันเกิด</dt><dd>{formatThaiDate(registrationDetail.proposed.birthDate)}</dd></div>
                </dl>
              </article>
            </div>
            <article className="registration-evidence">
              <div>
                <h3>หลักฐานประกอบ</h3>
                <p>{registrationDetail.attachments.length ? `${registrationDetail.attachments.length} ไฟล์` : "ยังไม่มีไฟล์แนบในข้อมูลนี้"}</p>
              </div>
              {registrationDetail.attachments.length ? (
                <ul>
                  {registrationDetail.attachments.map((file) => (
                    <li key={file.id}>
                      <div>
                        <b>{file.fileName}</b>
                        <span>{file.mimeType} · {Math.ceil(Number(file.fileSize || 0) / 1024).toLocaleString("th-TH")} KB</span>
                      </div>
                      <button type="button" onClick={() => void downloadAttachment(file)}>เปิดไฟล์</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="registration-warning">ควรตรวจข้อมูลเจ้าของและภาพสัตว์เลี้ยงก่อนรับรองเข้าทะเบียน</span>
              )}
            </article>
            {registrationDetail.reviewNote ? (
              <div className="registration-previous-note">
                <b>หมายเหตุจากการตรวจครั้งก่อน</b>
                <span>{registrationDetail.reviewNote}</span>
              </div>
            ) : null}
            {!CLOSED_STATUSES.includes(registrationDetail.status) ? (
              <form
                className="registration-decision"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (decision) void updateRegistrationStatus(registrationDetail.id, decision, note);
                }}
              >
                <label>
                  ผลการตรวจ
                  <select value={decision} onChange={(event) => setDecision(event.target.value)} required>
                    <option value="">เลือกผลการตรวจ</option>
                    {registrationDetail.status !== "UNDER_REVIEW" ? <option value="UNDER_REVIEW">เริ่มตรวจสอบ</option> : null}
                    <option value="NEED_MORE_INFO">ส่งกลับให้แก้ไข</option>
                    <option value="APPROVED">รับรองและออกเลขทะเบียน</option>
                    <option value="REJECTED">ไม่ผ่านการตรวจสอบ</option>
                  </select>
                </label>
                <label>
                  หมายเหตุ
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength="500"
                    required={["NEED_MORE_INFO", "REJECTED"].includes(decision)}
                    placeholder="ระบุข้อมูลที่ต้องแก้ไขหรือเหตุผลให้ชัดเจน"
                  />
                </label>
                <div className="dialog-actions">
                  <button type="button" onClick={() => setRegistrationDetail(null)}>ยกเลิก</button>
                  <button type="submit" className="approve" disabled={!decision || Boolean(busy)}>
                    {busy ? "กำลังบันทึก…" : "ยืนยันผลการตรวจ"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="registration-closed">
                <b>ดำเนินการเสร็จสิ้น</b>
                <span>{registrationDetail.reviewerName ? `ตรวจโดย ${registrationDetail.reviewerName}` : "—"} · {formatThaiDate(registrationDetail.reviewedAt)}</span>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {changeDetail ? (
        <div className="modal-backdrop registration-backdrop" role="presentation">
          <section className="registration-dialog" role="dialog" aria-modal="true" aria-labelledby="change-detail-title">
            <header className="registration-dialog-head">
              <div>
                <p className="eyebrow">ข้อมูล {changeDetail.referenceNo}</p>
                <h2 id="change-detail-title">{REQUEST_LABELS[changeDetail.subjectType] || changeDetail.subjectType}</h2>
                <span className={`badge ${getStatusTone(changeDetail.status)}`}>
                  {STATUS_LABELS[changeDetail.status] || changeDetail.status}
                </span>
              </div>
              <button type="button" aria-label="ปิด" onClick={() => setChangeDetail(null)}>×</button>
            </header>
            <div className="registration-review-grid">
              <ValueCard title="ข้อมูลปัจจุบัน" values={changeDetail.current} />
              <ValueCard title="ข้อมูลที่เจ้าของส่งมา" values={changeDetail.proposed} />
            </div>
            {changeDetail.reviewNote ? (
              <div className="registration-previous-note">
                <b>หมายเหตุจากการตรวจครั้งก่อน</b>
                <span>{changeDetail.reviewNote}</span>
              </div>
            ) : null}
            {!CLOSED_STATUSES.includes(changeDetail.status) ? (
              <form
                className="registration-decision"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (decision) void updateCitizenStatus(changeDetail, decision, note);
                }}
              >
                <label>
                  ผลการตรวจ
                  <select value={decision} onChange={(event) => setDecision(event.target.value)} required>
                    <option value="">เลือกผลการตรวจ</option>
                    {changeDetail.status !== "UNDER_REVIEW" ? <option value="UNDER_REVIEW">เริ่มตรวจสอบ</option> : null}
                    <option value="NEED_MORE_INFO">ส่งกลับให้แก้ไข</option>
                    <option value="APPROVED">รับรองและอัปเดตทะเบียน</option>
                    <option value="REJECTED">ไม่ผ่านการตรวจสอบ</option>
                  </select>
                </label>
                <label>
                  หมายเหตุ
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength="500"
                    required={["NEED_MORE_INFO", "REJECTED"].includes(decision)}
                    placeholder="ระบุข้อมูลที่ต้องแก้ไขหรือเหตุผลให้ชัดเจน"
                  />
                </label>
                <div className="dialog-actions">
                  <button type="button" onClick={() => setChangeDetail(null)}>ยกเลิก</button>
                  <button type="submit" className="approve" disabled={!decision || Boolean(busy)}>
                    {busy ? "กำลังบันทึก…" : "ยืนยันผลการตรวจ"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="registration-closed">
                <b>ดำเนินการเสร็จสิ้น</b>
                <span>{changeDetail.reviewerName ? `ตรวจโดย ${changeDetail.reviewerName}` : "—"} · {formatThaiDate(changeDetail.reviewedAt)}</span>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function ValueCard({ title, values }) {
  const entries = Object.entries(values || {}).filter(([key]) => key !== "subjectType");
  return (
    <article>
      <h3>{title}</h3>
      {entries.length ? (
        <dl>
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt>{FIELD_LABELS[key] || key}</dt>
              <dd>
                {key === "species"
                  ? (SPECIES_LABELS[value] || value)
                  : key === "sex"
                    ? (SEX_LABELS[value] || value)
                    : ["birthDate", "vaccinatedAt", "nextDueAt", "sterilizedAt", "effectiveAt"].includes(key)
                      ? formatThaiDate(value)
                      : String(value || "—")}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>ยังไม่มีข้อมูลเดิม</p>
      )}
    </article>
  );
}

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
} from "../components/common/PageUI.jsx";

const REGISTRATION_LABELS = {
  SUBMITTED: "รอตรวจสอบ",
  UNDER_REVIEW: "กำลังตรวจ",
  NEED_MORE_INFO: "ขอข้อมูลเพิ่ม",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
};

const SPECIES_LABELS = { DOG: "สุนัข", CAT: "แมว" };
const SEX_LABELS = { MALE: "เพศผู้", FEMALE: "เพศเมีย", UNKNOWN: "ไม่ระบุ" };

function maskNationalId(value) {
  if (!value) return "ไม่ระบุ";
  return `x-xxxx-xxxxx-${String(value).slice(-2)}-x`;
}

function formatThaiDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function getStatusTone(status) {
  if (status === "APPROVED") {
    return "green";
  }

  if (status === "REJECTED") {
    return "gray";
  }

  return "amber";
}

export default function RegistrationsPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const requestSequence = useRef(0);

  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    setMessage("");

    try {
      const query = filter
        ? `?status=${encodeURIComponent(filter)}`
        : "";

      const data = await api.get(
        `/api/admin/registrations${query}`,
      );

      if (requestId !== requestSequence.current) {
        return;
      }

      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setRows([]);

      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดคำขอขึ้นทะเบียนได้",
      );
    }
  }, [api, filter]);

  /*
   * ห้ามเขียน useEffect(load, ...)
   * เพราะ load เป็น async และคืนค่า Promise
   *
   * Wrapper นี้ไม่คืน Promise ให้ React
   * และคืนเฉพาะฟังก์ชัน cleanup ที่ถูกต้อง
   */
  useEffect(() => {
    void load();

    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  async function openDetail(id) {
    setDetailLoading(true);
    setMessage("");
    try {
      const data = await api.get(`/api/admin/registrations/${id}`);
      setDetail(data);
      setDecision("");
      setNote(data.reviewNote || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดรายละเอียดคำขอได้");
    } finally {
      setDetailLoading(false);
    }
  }

  async function changeStatus(id, status, reviewNote = "") {
    const busyKey = `${id}:${status}`;

    setBusy(busyKey);
    setMessage("");

    try {
      await api.patch(
        `/api/admin/registrations/${id}/status`,
        {
          status,
          note: reviewNote,
        },
      );

      await load();
      if (detail?.id === id) setDetail(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถเปลี่ยนสถานะคำขอได้",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHead
        eyebrow="งานทะเบียน"
        title="คำขอขึ้นทะเบียน"
        detail="ตรวจสอบข้อมูลจาก LINE และช่องทางออนไลน์ก่อนออกเลขทะเบียน"
        actions={
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value)
            }
          >
            <option value="">ทุกสถานะ</option>

            {Object.entries(REGISTRATION_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        }
      />

      <Notice message={message} />

      <article className="panel module-panel">
        {rows.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เลขที่คำขอ</th>
                  <th>เจ้าของ / สัตว์</th>
                  <th>หมู่</th>
                  <th>ยื่นเมื่อ</th>
                  <th>สถานะ</th>
                  <th>ดำเนินการ</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((registration) => {
                  const processing = Boolean(busy);

                  return (
                    <tr key={registration.id}>
                      <td>
                        <b>
                          {registration.referenceNo || "—"}
                        </b>
                      </td>

                      <td>
                        <div className="pet-cell">
                          <i>
                            {registration.species === "DOG"
                              ? "ส"
                              : "ม"}
                          </i>

                          <span>
                            <b>
                              {registration.petName ||
                                "ไม่ระบุชื่อ"}
                            </b>

                            <small>
                              {registration.ownerName ||
                                "ไม่ระบุเจ้าของ"}
                            </small>
                          </span>
                        </div>
                      </td>

                      <td>{registration.villageNo || "—"}</td>

                      <td>
                        {formatThaiDate(
                          registration.submittedAt,
                        )}
                      </td>

                      <td>
                        <span
                          className={`badge ${getStatusTone(
                            registration.status,
                          )}`}
                        >
                          {REGISTRATION_LABELS[
                            registration.status
                          ] ||
                            registration.status ||
                            "ไม่ระบุ"}
                        </span>
                      </td>

                      <td>
                        <div className="action-group">
                          <button
                            type="button"
                            disabled={detailLoading}
                            onClick={() => openDetail(registration.id)}
                          >
                            ตรวจรายละเอียด
                          </button>
                          {![
                            "APPROVED",
                            "REJECTED",
                          ].includes(registration.status) && (
                            <>
                              {registration.status !== "UNDER_REVIEW" ? <button
                                  type="button"
                                  disabled={processing}
                                  onClick={() =>
                                    changeStatus(
                                      registration.id,
                                      "UNDER_REVIEW",
                                    )
                                  }
                                >
                                  รับตรวจ
                                </button> : null}

                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="ไม่มีคำขอในสถานะที่เลือก" />
        )}
      </article>

      {detail ? (
        <div className="modal-backdrop registration-backdrop" role="presentation">
          <section className="registration-dialog" role="dialog" aria-modal="true" aria-labelledby="registration-detail-title">
            <header className="registration-dialog-head">
              <div><p className="eyebrow">คำขอ {detail.referenceNo}</p><h2 id="registration-detail-title">ตรวจข้อมูลก่อนอนุมัติ</h2><span className={`badge ${getStatusTone(detail.status)}`}>{REGISTRATION_LABELS[detail.status]}</span></div>
              <button type="button" aria-label="ปิด" onClick={() => setDetail(null)}>×</button>
            </header>

            <div className="registration-review-grid">
              <article><h3>ข้อมูลเจ้าของที่เสนอ</h3><dl><div><dt>ชื่อ–นามสกุล</dt><dd>{detail.proposed.ownerName}</dd></div><div><dt>โทรศัพท์</dt><dd>{detail.proposed.phone}</dd></div><div><dt>เลขบัตรประชาชน</dt><dd>{maskNationalId(detail.proposed.nationalId)}</dd></div><div><dt>ที่อยู่</dt><dd>บ้านเลขที่ {detail.proposed.houseNo} หมู่ {detail.proposed.villageNo} {detail.proposed.villageName}</dd></div><div><dt>รายละเอียด</dt><dd>{detail.proposed.addressDetail || "—"}</dd></div></dl></article>
              <article><h3>ข้อมูลสัตว์ที่เสนอ</h3><dl><div><dt>ชื่อสัตว์</dt><dd>{detail.proposed.petName}</dd></div><div><dt>ชนิด / เพศ</dt><dd>{SPECIES_LABELS[detail.proposed.species]} · {SEX_LABELS[detail.proposed.sex]}</dd></div><div><dt>พันธุ์</dt><dd>{detail.proposed.breed || "ไม่ระบุ"}</dd></div><div><dt>สี</dt><dd>{detail.proposed.color || "ไม่ระบุ"}</dd></div><div><dt>วันเกิด</dt><dd>{formatThaiDate(detail.proposed.birthDate)}</dd></div></dl></article>
            </div>

            <article className="registration-evidence"><div><h3>หลักฐานประกอบ</h3><p>{detail.attachments.length ? `${detail.attachments.length} ไฟล์` : "ยังไม่มีไฟล์แนบในคำขอนี้"}</p></div>{detail.attachments.length ? <ul>{detail.attachments.map((file) => <li key={file.id}><b>{file.fileName}</b><span>{file.mimeType} · {Math.ceil(Number(file.fileSize || 0) / 1024).toLocaleString("th-TH")} KB</span></li>)}</ul> : <span className="registration-warning">ควรตรวจเอกสารยืนยันเจ้าของและภาพสัตว์ก่อนอนุมัติ</span>}</article>

            {detail.reviewNote ? <div className="registration-previous-note"><b>หมายเหตุจากการตรวจครั้งก่อน</b><span>{detail.reviewNote}</span></div> : null}

            {!['APPROVED', 'REJECTED'].includes(detail.status) ? <form className="registration-decision" onSubmit={(event) => { event.preventDefault(); if (decision) changeStatus(detail.id, decision, note); }}><label>ผลการตรวจ<select value={decision} onChange={(event) => setDecision(event.target.value)} required><option value="">เลือกผลการตรวจ</option>{detail.status !== 'UNDER_REVIEW' ? <option value="UNDER_REVIEW">รับตรวจสอบ</option> : null}<option value="NEED_MORE_INFO">ส่งกลับให้แก้ไข/ขอข้อมูลเพิ่ม</option><option value="APPROVED">อนุมัติและออกเลขทะเบียน</option><option value="REJECTED">ไม่อนุมัติ</option></select></label><label>หมายเหตุ<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength="500" required={['NEED_MORE_INFO', 'REJECTED'].includes(decision)} placeholder="ระบุสิ่งที่ต้องแก้ไขหรือเหตุผลประกอบการพิจารณา" /></label><div className="dialog-actions"><button type="button" onClick={() => setDetail(null)}>ยกเลิก</button><button type="submit" className="approve" disabled={!decision || Boolean(busy)}>{busy ? "กำลังบันทึก…" : "ยืนยันผลการตรวจ"}</button></div></form> : <div className="registration-closed"><b>ดำเนินการเสร็จสิ้น</b><span>{detail.reviewerName ? `ตรวจโดย ${detail.reviewerName}` : "—"} · {formatThaiDate(detail.reviewedAt)}</span></div>}
          </section>
        </div>
      ) : null}
    </>
  );
}

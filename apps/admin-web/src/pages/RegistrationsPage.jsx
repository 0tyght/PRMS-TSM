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

  async function changeStatus(id, status) {
    const busyKey = `${id}:${status}`;

    setBusy(busyKey);
    setMessage("");

    try {
      await api.patch(
        `/api/admin/registrations/${id}/status`,
        {
          status,
        },
      );

      await load();
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
                          {![
                            "APPROVED",
                            "REJECTED",
                          ].includes(registration.status) && (
                            <>
                              <button
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
                              </button>

                              <button
                                type="button"
                                className="approve"
                                disabled={processing}
                                onClick={() =>
                                  changeStatus(
                                    registration.id,
                                    "APPROVED",
                                  )
                                }
                              >
                                อนุมัติ
                              </button>

                              <button
                                type="button"
                                className="reject"
                                disabled={processing}
                                onClick={() =>
                                  changeStatus(
                                    registration.id,
                                    "REJECTED",
                                  )
                                }
                              >
                                ไม่อนุมัติ
                              </button>
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
    </>
  );
}
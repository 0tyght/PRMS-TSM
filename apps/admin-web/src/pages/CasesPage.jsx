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

const CASE_STATUS_LABELS = {
  RECEIVED: "รับเรื่องแล้ว",
  ASSIGNED: "มอบหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิดเรื่อง",
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

export default function CasesPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const requestSequence = useRef(0);

  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [busyCaseId, setBusyCaseId] = useState("");

  const load = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    setMessage("");

    try {
      const data = await api.get("/api/admin/cases");

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
          : "ไม่สามารถโหลดข้อมูลแจ้งเหตุได้",
      );
    }
  }, [api]);

  /*
   * เรียก async function ภายใน Effect
   * แต่ไม่คืน Promise ให้ React
   */
  useEffect(() => {
    void load();

    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  async function changeStatus(id, status) {
    setBusyCaseId(id);
    setMessage("");

    try {
      await api.patch(`/api/admin/cases/${id}/status`, {
        status,
      });

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถเปลี่ยนสถานะเรื่องแจ้งได้",
      );
    } finally {
      setBusyCaseId("");
    }
  }

  return (
    <>
      <PageHead
        eyebrow="ศูนย์รับแจ้ง"
        title="แจ้งเหตุและร้องเรียน"
        detail="ติดตามเหตุสัตว์จรจัด กัดทำร้าย เจ็บป่วย และเหตุรำคาญ"
      />

      <Notice message={message} />

      <article className="panel module-panel">
        {rows.length > 0 ? (
          <div className="case-list">
            {rows.map((caseItem) => (
              <div className="case-row" key={caseItem.id}>
                <div className="case-symbol">!</div>

                <div>
                  <b>
                    {caseItem.referenceNo || "ไม่มีเลขอ้างอิง"}
                    {" · "}
                    {caseItem.category || "OTHER"}
                  </b>

                  <p>
                    {caseItem.description ||
                      "ไม่มีรายละเอียดเพิ่มเติม"}
                  </p>

                  <small>
                    หมู่ {caseItem.villageNo || "—"}
                    {" · "}
                    {formatThaiDate(caseItem.createdAt)}
                    {" · "}
                    {caseItem.reporterName || "ไม่ระบุผู้แจ้ง"}
                  </small>
                </div>

                <select
                  value={caseItem.status}
                  disabled={busyCaseId === caseItem.id}
                  onChange={(event) =>
                    changeStatus(
                      caseItem.id,
                      event.target.value,
                    )
                  }
                >
                  {Object.entries(CASE_STATUS_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="ขณะนี้ไม่มีเหตุที่รับแจ้ง" />
        )}
      </article>
    </>
  );
}
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createApi } from "../../lib/api.js";
import {
  EmptyState,
  Notice,
  PageHead,
} from "../common/PageUI.jsx";
import "./PetDirectory.css";

const PET_STATUS_LABELS = {
  ACTIVE: "ปกติ",
  MISSING: "สูญหาย",
  TRANSFERRED: "ย้ายเจ้าของ",
  DECEASED: "เสียชีวิต",
};

const PET_STATUS_TONES = {
  ACTIVE: "active",
  MISSING: "missing",
  TRANSFERRED: "transferred",
  DECEASED: "deceased",
};

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const text = String(value).slice(0, 10);
  const parts = text.split("-").map(Number);

  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isFinite(part))
  ) {
    return null;
  }

  const [year, month, day] = parts;

  return new Date(year, month - 1, day, 12, 0, 0);
}

function formatThaiDate(value, fallback = "—") {
  const date = parseDate(value);

  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRegistrationDate(value) {
  return formatThaiDate(value, "ไม่ระบุวันที่");
}

function addOneYear(dateText) {
  const date = parseDate(dateText) || new Date();

  date.setFullYear(date.getFullYear() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getVaccinationStatus(pet) {
  if (!pet.lastVaccinatedAt) {
    return {
      key: "NONE",
      label: "ยังไม่มีประวัติ",
      tone: "none",
    };
  }

  if (!pet.nextVaccinationDueAt) {
    return {
      key: "RECORDED",
      label: "มีประวัติวัคซีน",
      tone: "recorded",
    };
  }

  const dueDate = parseDate(pet.nextVaccinationDueAt);

  if (!dueDate) {
    return {
      key: "RECORDED",
      label: "มีประวัติวัคซีน",
      tone: "recorded",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const remainingDays = Math.ceil(
    (dueDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (remainingDays < 0) {
    return {
      key: "OVERDUE",
      label: "เกินกำหนด",
      tone: "overdue",
    };
  }

  if (remainingDays <= 30) {
    return {
      key: "DUE_SOON",
      label: `ครบกำหนดใน ${remainingDays} วัน`,
      tone: "due-soon",
    };
  }

  return {
    key: "CURRENT",
    label: "ยังไม่ครบกำหนด",
    tone: "current",
  };
}

function getPetInitial(pet) {
  if (pet.species === "DOG") {
    return "ส";
  }

  if (pet.species === "CAT") {
    return "ม";
  }

  return "–";
}

function getSpeciesLabel(species) {
  if (species === "DOG") {
    return "สุนัข";
  }

  if (species === "CAT") {
    return "แมว";
  }

  return "ไม่ระบุ";
}

function getSexLabel(sex) {
  if (sex === "MALE") {
    return "เพศผู้";
  }

  if (sex === "FEMALE") {
    return "เพศเมีย";
  }

  return "ไม่ระบุเพศ";
}

function ServiceDialog({
  pet,
  api,
  onClose,
  onSaved,
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState("vaccine");
  const [serviceDate, setServiceDate] = useState(today);
  const [vaccineName, setVaccineName] = useState(
    "วัคซีนป้องกันโรคพิษสุนัขบ้า",
  );
  const [nextDueAt, setNextDueAt] = useState(
    addOneYear(today),
  );
  const [lotNo, setLotNo] = useState("");
  const [providerName, setProviderName] = useState(
    "เทศบาลท่าโพธ์",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function handleServiceDateChange(event) {
    const value = event.target.value;

    setServiceDate(value);

    if (type === "vaccine") {
      setNextDueAt(addOneYear(value));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      if (type === "vaccine") {
        await api.post(
          `/api/admin/pets/${pet.id}/vaccinations`,
          {
            vaccineName: vaccineName.trim(),
            vaccinatedAt: serviceDate,
            nextDueAt,
            lotNo: lotNo.trim(),
            providerName: providerName.trim(),
          },
        );
      } else {
        await api.post(
          `/api/admin/pets/${pet.id}/sterilizations`,
          {
            sterilizedAt: serviceDate,
            providerName: providerName.trim(),
            note: note.trim(),
          },
        );
      }

      await onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึกข้อมูลได้",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="pet-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form
        className="pet-service-dialog"
        onSubmit={handleSubmit}
      >
        <div className="pet-dialog-header">
          <div>
            <p className="eyebrow">บันทึกบริการสัตวแพทย์</p>
            <h2>{pet.petName}</h2>
            <p>
              {pet.registrationNo || "ไม่มีเลขทะเบียน"} ·{" "}
              {pet.ownerName}
            </p>
          </div>

          <button
            type="button"
            className="pet-dialog-close"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
          >
            ×
          </button>
        </div>

        <div className="pet-dialog-summary">
          <span
            className={`pet-avatar ${
              pet.species === "CAT" ? "cat" : "dog"
            }`}
          >
            {getPetInitial(pet)}
          </span>

          <div>
            <strong>
              {getSpeciesLabel(pet.species)} ·{" "}
              {getSexLabel(pet.sex)}
            </strong>
            <span>
              {pet.breed || "ไม่ระบุสายพันธุ์"} · บ้านเลขที่{" "}
              {pet.houseNo || "-"} หมู่ {pet.villageNo || "-"}
            </span>
          </div>
        </div>

        <label className="pet-form-field">
          <span>ประเภทบริการ</span>

          <select
            value={type}
            onChange={(event) => {
              const value = event.target.value;

              setType(value);

              if (value === "vaccine") {
                setNextDueAt(addOneYear(serviceDate));
              }
            }}
          >
            <option value="vaccine">ฉีดวัคซีน</option>
            <option value="sterilization">ทำหมัน</option>
          </select>
        </label>

        {type === "vaccine" && (
          <>
            <label className="pet-form-field">
              <span>ชื่อวัคซีน</span>

              <input
                value={vaccineName}
                onChange={(event) =>
                  setVaccineName(event.target.value)
                }
                required
              />
            </label>

            <div className="pet-form-grid">
              <label className="pet-form-field">
                <span>เลขล็อตวัคซีน</span>

                <input
                  value={lotNo}
                  onChange={(event) =>
                    setLotNo(event.target.value)
                  }
                  placeholder="ไม่บังคับ"
                />
              </label>

              <label className="pet-form-field">
                <span>วันครบกำหนดครั้งถัดไป</span>

                <input
                  type="date"
                  value={nextDueAt}
                  min={serviceDate}
                  onChange={(event) =>
                    setNextDueAt(event.target.value)
                  }
                />
              </label>
            </div>
          </>
        )}

        <div className="pet-form-grid">
          <label className="pet-form-field">
            <span>วันที่ให้บริการ</span>

            <input
              type="date"
              value={serviceDate}
              max={today}
              onChange={handleServiceDateChange}
              required
            />
          </label>

          <label className="pet-form-field">
            <span>หน่วยบริการ</span>

            <input
              value={providerName}
              onChange={(event) =>
                setProviderName(event.target.value)
              }
              required
            />
          </label>
        </div>

        {type === "sterilization" && (
          <label className="pet-form-field">
            <span>หมายเหตุ</span>

            <textarea
              value={note}
              onChange={(event) =>
                setNote(event.target.value)
              }
              rows={3}
              placeholder="รายละเอียดเพิ่มเติม"
            />
          </label>
        )}

        <Notice message={message} />

        <div className="pet-dialog-actions">
          <button
            type="button"
            className="pet-secondary-button"
            onClick={onClose}
            disabled={busy}
          >
            ยกเลิก
          </button>

          <button
            type="submit"
            className="pet-primary-button"
            disabled={busy}
          >
            {busy ? "กำลังบันทึก…" : "บันทึกข้อมูลจริง"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PetLifecycleDialog({ pet, api, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [detail, setDetail] = useState(null);
  const [owners, setOwners] = useState([]);
  const [mode, setMode] = useState("status");
  const [nextStatus, setNextStatus] = useState(pet.status === "ACTIVE" ? "MISSING" : "ACTIVE");
  const [ownerId, setOwnerId] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(today);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/api/admin/pets/${pet.id}`),
      api.get("/api/admin/owners"),
    ]).then(([petDetail, ownerRows]) => {
      setDetail(petDetail);
      setOwners((Array.isArray(ownerRows) ? ownerRows : []).filter((owner) => owner.id !== pet.ownerId));
    }).catch((error) => setMessage(error.message));
  }, [api, pet.id, pet.ownerId]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "status") {
        await api.patch(`/api/admin/pets/${pet.id}/status`, { status: nextStatus, effectiveAt, note });
      } else {
        await api.patch(`/api/admin/pets/${pet.id}/owner`, { ownerId, transferredAt: effectiveAt, reason: note });
      }
      await onSaved();
    } catch (error) {
      setMessage(error.message || "ไม่สามารถบันทึกการเปลี่ยนแปลงได้");
    } finally {
      setBusy(false);
    }
  }

  return <div className="pet-modal-backdrop" role="presentation"><section className="pet-service-dialog pet-lifecycle-dialog"><div className="pet-dialog-header"><div><p className="eyebrow">ประวัติและวงจรชีวิตสัตว์</p><h2>{pet.petName}</h2><p>{pet.registrationNo} · เจ้าของปัจจุบัน {pet.ownerName}</p></div><button type="button" className="pet-dialog-close" onClick={onClose}>×</button></div>
    <div className="pet-lifecycle-tabs"><button type="button" className={mode === "status" ? "active" : ""} onClick={() => setMode("status")}>เปลี่ยนสถานะ</button><button type="button" className={mode === "owner" ? "active" : ""} onClick={() => setMode("owner")}>โอนเจ้าของ</button></div>
    <form onSubmit={submit} className="pet-lifecycle-form">{mode === "status" ? <label className="pet-form-field"><span>สถานะใหม่</span><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{Object.entries(PET_STATUS_LABELS).filter(([value]) => value !== pet.status).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <label className="pet-form-field"><span>เจ้าของใหม่</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required><option value="">เลือกจากทะเบียนเจ้าของ</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName} · บ้านเลขที่ {owner.houseNo} หมู่ {owner.villageNo}</option>)}</select></label>}<label className="pet-form-field"><span>วันที่มีผล</span><input type="date" value={effectiveAt} max={today} onChange={(event) => setEffectiveAt(event.target.value)} required /></label><label className="pet-form-field pet-lifecycle-note"><span>{mode === "owner" ? "เหตุผลการโอน" : "เหตุผล/รายละเอียด"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} minLength="2" maxLength="500" rows="3" required /></label><Notice message={message}/><div className="pet-dialog-actions"><button type="button" className="pet-secondary-button" onClick={onClose}>ยกเลิก</button><button type="submit" className="pet-primary-button" disabled={busy}>{busy ? "กำลังบันทึก…" : "ยืนยันการเปลี่ยนแปลง"}</button></div></form>
    <div className="pet-history-section"><h3>ประวัติล่าสุด</h3>{!detail ? <p>กำลังโหลดประวัติ…</p> : <div className="pet-history-columns"><div><b>สถานะ</b>{detail.statusHistory.length ? detail.statusHistory.slice(0, 6).map((item) => <article key={item.id}><span>{PET_STATUS_LABELS[item.newStatus] || item.newStatus}</span><small>{formatThaiDate(item.effectiveAt)} · {item.note || "—"}</small></article>) : <p>ยังไม่มีประวัติ</p>}</div><div><b>เจ้าของ</b>{detail.ownerHistory.length ? detail.ownerHistory.slice(0, 6).map((item) => <article key={item.id}><span>{item.newOwner}</span><small>{formatThaiDate(item.transferredAt)} · {item.reason || "เริ่มต้นทะเบียน"}</small></article>) : <p>ยังไม่มีประวัติ</p>}</div></div>}</div>
  </section></div>;
}

function PetSummaryCards({ rows, visibleCount }) {
  const summary = useMemo(() => {
    return rows.reduce(
      (result, pet) => {
        result.total += 1;

        if (pet.species === "DOG") {
          result.dogs += 1;
        }

        if (pet.species === "CAT") {
          result.cats += 1;
        }

        if (pet.lastVaccinatedAt) {
          result.vaccinated += 1;
        }

        if (Boolean(Number(pet.sterilized))) {
          result.sterilized += 1;
        }

        return result;
      },
      {
        total: 0,
        dogs: 0,
        cats: 0,
        vaccinated: 0,
        sterilized: 0,
      },
    );
  }, [rows]);

  const cards = [
    {
      label: "สัตว์ที่พบ",
      value: visibleCount,
      detail: `จากข้อมูล ${summary.total} รายการ`,
      icon: "ท",
      tone: "green",
    },
    {
      label: "สุนัข",
      value: summary.dogs,
      detail: "สัตว์ที่ขึ้นทะเบียนแล้ว",
      icon: "ส",
      tone: "amber",
    },
    {
      label: "แมว",
      value: summary.cats,
      detail: "สัตว์ที่ขึ้นทะเบียนแล้ว",
      icon: "ม",
      tone: "blue",
    },
    {
      label: "มีประวัติวัคซีน",
      value: summary.vaccinated,
      detail: `ทำหมันแล้ว ${summary.sterilized} ตัว`,
      icon: "ว",
      tone: "violet",
    },
  ];

  return (
    <section className="pet-summary-grid">
      {cards.map((card) => (
        <article
          key={card.label}
          className={`pet-summary-card ${card.tone}`}
        >
          <span className="pet-summary-icon">
            {card.icon}
          </span>

          <div>
            <span>{card.label}</span>
            <strong>{card.value.toLocaleString("th-TH")}</strong>
            <small>{card.detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

export default function PetDirectory({
  token,
  serviceMode = false,
}) {
  const api = useMemo(() => createApi(token), [token]);
  const requestSequence = useRef(0);

  const [rows, setRows] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [species, setSpecies] = useState("");
  const [status, setStatus] = useState("");
  const [vaccination, setVaccination] = useState("");
  const [sterilization, setSterilization] = useState("");
  const [selectedPet, setSelectedPet] = useState(null);
  const [lifecyclePet, setLifecyclePet] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  const loadPets = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    setLoading(true);
    setMessage("");

    try {
      const query = new URLSearchParams();

      if (search) {
        query.set("search", search);
      }

      if (species) {
        query.set("species", species);
      }

      const path = `/api/admin/pets${
        query.toString() ? `?${query.toString()}` : ""
      }`;

      const data = await api.get(path);

      if (requestId !== requestSequence.current) {
        return;
      }

      const safeRows = Array.isArray(data)
        ? data.filter(
            (item) =>
              item &&
              typeof item === "object" &&
              !Array.isArray(item),
          )
        : [];

      setRows(safeRows);
    } catch (error) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setRows([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดข้อมูลสัตว์จากฐานข้อมูลได้",
      );
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [api, search, species]);

  useEffect(() => {
    loadPets();
  }, [loadPets]);

  const filteredRows = useMemo(() => {
    return rows.filter((pet) => {
      if (status && pet.status !== status) {
        return false;
      }

      if (sterilization === "DONE") {
        if (!Boolean(Number(pet.sterilized))) {
          return false;
        }
      }

      if (sterilization === "NOT_DONE") {
        if (Boolean(Number(pet.sterilized))) {
          return false;
        }
      }

      if (vaccination) {
        const vaccineStatus = getVaccinationStatus(pet);

        if (vaccineStatus.key !== vaccination) {
          return false;
        }
      }

      return true;
    });
  }, [
    rows,
    status,
    sterilization,
    vaccination,
  ]);

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setSpecies("");
    setStatus("");
    setVaccination("");
    setSterilization("");
  }

  const hasFilters = Boolean(
    searchInput ||
      species ||
      status ||
      vaccination ||
      sterilization,
  );

  return (
    <div className="pet-directory">
      <PageHead
        eyebrow={
          serviceMode
            ? "งานบริการสัตวแพทย์"
            : "ทะเบียนสัตว์เลี้ยง"
        }
        title={
          serviceMode
            ? "บันทึกวัคซีนและการทำหมัน"
            : "ข้อมูลสัตว์ขึ้นทะเบียน"
        }
        detail={
          serviceMode
            ? "ค้นหาและบันทึกบริการลงฐานข้อมูลจริง พร้อมตรวจสอบสถานะล่าสุด"
            : "แสดงข้อมูลสัตว์ เจ้าของ ที่อยู่ วัคซีน และการทำหมันจากฐานข้อมูลจริง"
        }
        actions={
          <button
            type="button"
            className="pet-refresh-button"
            onClick={loadPets}
            disabled={loading}
          >
            <span>{loading ? "…" : "↻"}</span>
            {loading ? "กำลังโหลด" : "โหลดข้อมูลใหม่"}
          </button>
        }
      />

      <PetSummaryCards
        rows={rows}
        visibleCount={filteredRows.length}
      />

      <section className="pet-filter-panel">
        <div className="pet-search-field">
          <span aria-hidden="true">⌕</span>

          <input
            value={searchInput}
            onChange={(event) =>
              setSearchInput(event.target.value)
            }
            placeholder="ค้นหาชื่อสัตว์ เจ้าของ เบอร์โทร เลขทะเบียน หรือไมโครชิป"
          />
        </div>

        <select
          value={species}
          onChange={(event) =>
            setSpecies(event.target.value)
          }
          aria-label="กรองชนิดสัตว์"
        >
          <option value="">ทุกชนิด</option>
          <option value="DOG">สุนัข</option>
          <option value="CAT">แมว</option>
        </select>

        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value)
          }
          aria-label="กรองสถานะสัตว์"
        >
          <option value="">ทุกสถานะ</option>
          <option value="ACTIVE">ปกติ</option>
          <option value="MISSING">สูญหาย</option>
          <option value="TRANSFERRED">ย้ายเจ้าของ</option>
          <option value="DECEASED">เสียชีวิต</option>
        </select>

        <select
          value={vaccination}
          onChange={(event) =>
            setVaccination(event.target.value)
          }
          aria-label="กรองสถานะวัคซีน"
        >
          <option value="">วัคซีนทั้งหมด</option>
          <option value="NONE">ยังไม่มีประวัติ</option>
          <option value="RECORDED">มีประวัติวัคซีน</option>
          <option value="CURRENT">ยังไม่ครบกำหนด</option>
          <option value="DUE_SOON">ใกล้ครบกำหนด</option>
          <option value="OVERDUE">เกินกำหนด</option>
        </select>

        <select
          value={sterilization}
          onChange={(event) =>
            setSterilization(event.target.value)
          }
          aria-label="กรองสถานะทำหมัน"
        >
          <option value="">การทำหมันทั้งหมด</option>
          <option value="DONE">ทำหมันแล้ว</option>
          <option value="NOT_DONE">ยังไม่ทำหมัน</option>
        </select>

        {hasFilters && (
          <button
            type="button"
            className="pet-clear-button"
            onClick={clearFilters}
          >
            ล้างตัวกรอง
          </button>
        )}
      </section>

      <Notice message={message} />

      <article className="panel pet-table-panel">
        <div className="pet-table-heading">
          <div>
            <h2>
              {serviceMode
                ? "รายชื่อสัตว์สำหรับบันทึกบริการ"
                : "ทะเบียนสัตว์เลี้ยง"}
            </h2>

            <p>
              พบ {filteredRows.length.toLocaleString("th-TH")}{" "}
              รายการ
            </p>
          </div>

          <span className="pet-live-source">
            <i />
            MySQL จริง
          </span>
        </div>

        {loading ? (
          <div className="pet-loading-state">
            <span className="pet-loading-spinner" />
            <strong>กำลังโหลดข้อมูลจากฐานข้อมูล</strong>
            <small>กรุณารอสักครู่</small>
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            text={
              hasFilters
                ? "ไม่พบข้อมูลตามเงื่อนไขที่เลือก"
                : "ยังไม่มีสัตว์ที่ผ่านการขึ้นทะเบียน"
            }
            detail={
              hasFilters
                ? "ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง"
                : "ข้อมูลที่ได้รับอนุมัติจะแสดงที่หน้านี้"
            }
          />
        ) : (
          <div className="pet-table-wrap">
            <table className="pet-data-table">
              <thead>
                <tr>
                  <th>ข้อมูลสัตว์</th>
                  <th>ทะเบียน</th>
                  <th>เจ้าของและที่อยู่</th>
                  <th>สถานะ</th>
                  <th>วัคซีน</th>
                  <th>ทำหมัน</th>
                  <th>ดำเนินการ</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((pet) => {
                  const vaccinationStatus =
                    getVaccinationStatus(pet);

                  const sterilized = Boolean(
                    Number(pet.sterilized),
                  );

                  return (
                    <tr key={pet.id}>
                      <td>
                        <div className="pet-main-cell">
                          <span
                            className={`pet-avatar ${
                              pet.species === "CAT"
                                ? "cat"
                                : "dog"
                            }`}
                          >
                            {getPetInitial(pet)}
                          </span>

                          <div>
                            <strong>
                              {normalizeText(pet.petName) ||
                                "ไม่ระบุชื่อ"}
                            </strong>

                            <span>
                              {getSpeciesLabel(pet.species)} ·{" "}
                              {getSexLabel(pet.sex)}
                            </span>

                            <small>
                              {pet.breed ||
                                "ไม่ระบุสายพันธุ์"}
                              {pet.color
                                ? ` · ${pet.color}`
                                : ""}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="pet-registration-cell">
                          <strong>
                            {pet.registrationNo ||
                              "ไม่มีเลขทะเบียน"}
                          </strong>

                          <span>
                            ขึ้นทะเบียน{" "}
                            {formatRegistrationDate(
                              pet.registeredAt,
                            )}
                          </span>

                          {pet.microchipNo && (
                            <small>
                              ไมโครชิป: {pet.microchipNo}
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="pet-owner-cell">
                          <strong>
                            {pet.ownerName ||
                              "ไม่ระบุเจ้าของ"}
                          </strong>

                          <span>{pet.phone || "ไม่มีเบอร์โทร"}</span>

                          <small>
                            บ้านเลขที่ {pet.houseNo || "-"} หมู่{" "}
                            {pet.villageNo || "-"}
                          </small>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`pet-status-badge ${
                            PET_STATUS_TONES[
                              pet.status
                            ] || "unknown"
                          }`}
                        >
                          {PET_STATUS_LABELS[pet.status] ||
                            "ไม่ระบุ"}
                        </span>
                      </td>

                      <td>
                        <div className="pet-health-cell">
                          <span
                            className={`pet-health-badge ${vaccinationStatus.tone}`}
                          >
                            {vaccinationStatus.label}
                          </span>

                          <small>
                            ล่าสุด:{" "}
                            {formatThaiDate(
                              pet.lastVaccinatedAt,
                              "ยังไม่มีข้อมูล",
                            )}
                          </small>

                          {pet.nextVaccinationDueAt && (
                            <small>
                              ครั้งถัดไป:{" "}
                              {formatThaiDate(
                                pet.nextVaccinationDueAt,
                              )}
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`pet-sterilization-badge ${
                            sterilized ? "done" : "not-done"
                          }`}
                        >
                          {sterilized
                            ? "ทำหมันแล้ว"
                            : "ยังไม่ทำหมัน"}
                        </span>
                      </td>

                      <td>
                        {serviceMode ? (
                          <button
                            type="button"
                            className="pet-service-button"
                            onClick={() =>
                              setSelectedPet(pet)
                            }
                          >
                            + บันทึกบริการ
                          </button>
                        ) : <button type="button" className="pet-service-button" onClick={() => setLifecyclePet(pet)}>ดูประวัติ / เปลี่ยนสถานะ</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {selectedPet && (
        <ServiceDialog
          pet={selectedPet}
          api={api}
          onClose={() => setSelectedPet(null)}
          onSaved={async () => {
            setSelectedPet(null);
            await loadPets();
          }}
        />
      )}

      {lifecyclePet && <PetLifecycleDialog pet={lifecyclePet} api={api} onClose={() => setLifecyclePet(null)} onSaved={async () => { setLifecyclePet(null); await loadPets(); }} />}
    </div>
  );
}

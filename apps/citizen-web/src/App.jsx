import { useEffect, useMemo, useRef, useState } from "react";
import {
  ORGANIZATION,
  normalizeThaiPhone,
  validatePetRegistration,
} from "@prms/shared";
import { createCitizenApi } from "./api.js";
import { connectLine } from "./line.js";
import MapPicker from "./MapPicker.jsx";

const EMPTY_REGISTRATION = {
  ownerName: "",
  phone: "",
  nationalId: "",
  houseNo: "",
  villageId: "",
  addressDetail: "",
  latitude: null,
  longitude: null,
  petName: "",
  species: "DOG",
  sex: "UNKNOWN",
  breed: "",
  color: "",
  birthDate: "",
};

const FALLBACK_VILLAGES = Array.from({ length: 11 }, (_, index) => ({
  id: index + 1,
  villageNo: index + 1,
  name: `หมู่ที่ ${index + 1}`,
}));

const STATUS_LABELS = {
  SUBMITTED: "ส่งคำขอแล้ว",
  UNDER_REVIEW: "กำลังตรวจสอบ",
  NEED_MORE_INFO: "ต้องแก้ไขข้อมูล",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CANCELLED: "ยกเลิกแล้ว",
  ACTIVE: "ปกติ",
  MISSING: "สูญหาย",
  TRANSFERRED: "ย้ายเจ้าของ",
  DECEASED: "เสียชีวิต",
};

const SUBJECT_LABELS = {
  PET_UPDATE: "แก้ไขข้อมูลสัตว์",
  VACCINATION: "แจ้งวัคซีน",
  STERILIZATION: "แจ้งทำหมัน",
  PET_STATUS: "แจ้งสถานะสัตว์",
};

function routeFromUrl() {
  const query = new URLSearchParams(window.location.search);
  return {
    view: query.get("view") || "home",
    action: query.get("action") || "",
    section: query.get("section") || "",
  };
}

function setRoute(view, extras = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", view);

  Object.entries(extras).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  window.history.replaceState({}, "", url);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusClass(status) {
  if (status === "APPROVED" || status === "ACTIVE") return "status-success";
  if (status === "NEED_MORE_INFO" || status === "MISSING") return "status-warning";
  if (status === "REJECTED" || status === "DECEASED") return "status-danger";
  if (status === "CANCELLED" || status === "TRANSFERRED") return "status-muted";
  return "status-info";
}

function pickVaccinationPet(pets = []) {
  return [...pets]
    .filter((item) => item.status === "ACTIVE")
    .sort((left, right) => {
      const leftTime = left.lastVaccinatedAt
        ? new Date(left.lastVaccinatedAt).getTime()
        : 0;
      const rightTime = right.lastVaccinatedAt
        ? new Date(right.lastVaccinatedAt).getTime()
        : 0;
      return leftTime - rightTime;
    })[0] || null;
}

function Shell({ children, onNavigate, activeView }) {
  return (
    <div className="citizen-shell">
      <header className="citizen-header">
        <button
          type="button"
          className="brand-button"
          onClick={() => onNavigate("home")}
          aria-label="กลับหน้าหลัก"
        >
          <span className="brand-mark">TP</span>
          <span>
            <strong>ThaPho PET</strong>
            <small>ทะเบียนและติดตามสัตว์เลี้ยง</small>
          </span>
        </button>
        <button
          type="button"
          className="account-shortcut"
          onClick={() => onNavigate("account")}
        >
          <span aria-hidden="true">●</span>
          ข้อมูลของฉัน
        </button>
      </header>

      <main>{children}</main>

      <nav className="bottom-nav" aria-label="เมนูหลัก">
        <button
          type="button"
          className={activeView === "home" ? "active" : ""}
          onClick={() => onNavigate("home")}
        >
          <span>⌂</span>
          หน้าหลัก
        </button>
        <button
          type="button"
          className={activeView === "register" ? "active" : ""}
          onClick={() => onNavigate("register")}
        >
          <span>＋</span>
          ลงทะเบียน
        </button>
        <button
          type="button"
          className={activeView === "track" ? "active" : ""}
          onClick={() => onNavigate("track")}
        >
          <span>⌕</span>
          ติดตาม
        </button>
        <button
          type="button"
          className={activeView === "account" ? "active" : ""}
          onClick={() => onNavigate("account")}
        >
          <span>◎</span>
          ของฉัน
        </button>
      </nav>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function HomePage({ onNavigate }) {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">บริการประชาชนตำบลท่าโพธิ์</p>
          <h1>ดูแลสัตว์เลี้ยงให้ครบในที่เดียว</h1>
          <p>
            ลงทะเบียนสุนัขและแมว เลือกตำแหน่งบ้านบนแผนที่
            แจ้งวัคซีน ทำหมัน สถานะสัตว์ และติดตามผลผ่าน LINE
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => onNavigate("register")}
            >
              ลงทะเบียนสัตว์เลี้ยง
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onNavigate("account")}
            >
              เปิดข้อมูลของฉัน
            </button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <span className="pet-orbit pet-orbit-one">🐕</span>
          <span className="pet-orbit pet-orbit-two">🐈</span>
          <div className="hero-badge">
            <strong>THAPHO</strong>
            <span>PET CARE</span>
          </div>
        </div>
      </section>

      <section className="service-grid">
        <button type="button" className="service-card" onClick={() => onNavigate("register")}>
          <span className="service-icon">＋</span>
          <strong>ลงทะเบียนสัตว์</strong>
          <small>กรอกข้อมูลและปักหมุดบ้านบนแผนที่</small>
        </button>
        <button type="button" className="service-card" onClick={() => onNavigate("track")}>
          <span className="service-icon">⌕</span>
          <strong>ติดตามคำขอ</strong>
          <small>ตรวจสถานะด้วยเลขอ้างอิง</small>
        </button>
        <button type="button" className="service-card" onClick={() => onNavigate("account")}>
          <span className="service-icon">◎</span>
          <strong>สัตว์ของฉัน</strong>
          <small>ดูทะเบียนและแจ้งข้อมูลล่าสุด</small>
        </button>
        <button
          type="button"
          className="service-card"
          onClick={() => onNavigate("account", { section: "attention" })}
        >
          <span className="service-icon">!</span>
          <strong>สิ่งที่ต้องทำ</strong>
          <small>วัคซีน คำขอแก้ไข และตำแหน่งบ้าน</small>
        </button>
      </section>

      <section className="trust-strip">
        <div>
          <strong>ข้อมูลจริงจากระบบเทศบาล</strong>
          <span>สถานะและเมนูเปลี่ยนตามข้อมูลทะเบียนล่าสุด</span>
        </div>
        <div>
          <strong>เชื่อม LINE อย่างปลอดภัย</strong>
          <span>ใช้ LIFF เพื่อยืนยันตัวตนและเข้าถึงเฉพาะข้อมูลของคุณ</span>
        </div>
        <div>
          <strong>ระบุตำแหน่งได้แม่นยำ</strong>
          <span>เลือกบน OpenStreetMap หรือใช้ตำแหน่งปัจจุบัน</span>
        </div>
      </section>
    </div>
  );
}

function FieldError({ value }) {
  return value ? <span className="field-error">{value}</span> : null;
}

function RegistrationPage({
  form,
  setForm,
  errors,
  villages,
  saving,
  message,
  attachmentName,
  onAttachment,
  onSubmit,
}) {
  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "phone" ? normalizeThaiPhone(value) : value,
    }));
  }

  return (
    <div className="page narrow-page">
      <PageHeading
        eyebrow="ขึ้นทะเบียนใหม่"
        title="ลงทะเบียนสัตว์เลี้ยง"
        description="กรอกข้อมูลให้ครบและเลือกตำแหน่งบ้านบนแผนที่ก่อนส่งคำขอ"
      />

      <form className="stack-form" onSubmit={onSubmit}>
        <section className="form-section">
          <div className="section-title">
            <span>1</span>
            <div>
              <h2>ข้อมูลเจ้าของ</h2>
              <p>ใช้สำหรับติดต่อและเชื่อมทะเบียนกับ LINE</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="field field-wide">
              <span>ชื่อ–นามสกุลเจ้าของ *</span>
              <input
                name="ownerName"
                value={form.ownerName}
                onChange={update}
                autoComplete="name"
                placeholder="เช่น กมลรัตน์ มีศักดิ์"
              />
              <FieldError value={errors.ownerName} />
            </label>

            <label className="field">
              <span>เบอร์โทรศัพท์ *</span>
              <input
                name="phone"
                value={form.phone}
                onChange={update}
                inputMode="tel"
                autoComplete="tel"
                maxLength={10}
                placeholder="08xxxxxxxx"
              />
              <FieldError value={errors.phone} />
            </label>

            <label className="field">
              <span>เลขบัตรประชาชน</span>
              <input
                name="nationalId"
                value={form.nationalId}
                onChange={update}
                inputMode="numeric"
                maxLength={13}
                placeholder="13 หลัก (ไม่บังคับ)"
              />
              <FieldError value={errors.nationalId} />
            </label>
          </div>
        </section>

        <section className="form-section">
          <div className="section-title">
            <span>2</span>
            <div>
              <h2>ที่อยู่และตำแหน่งบ้าน</h2>
              <p>หมุดตำแหน่งจะใช้บนแผนที่เจ้าหน้าที่และงานติดตามวัคซีน</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>บ้านเลขที่ *</span>
              <input
                name="houseNo"
                value={form.houseNo}
                onChange={update}
                placeholder="เช่น 99/1"
              />
              <FieldError value={errors.houseNo} />
            </label>

            <label className="field">
              <span>หมู่บ้าน *</span>
              <select name="villageId" value={form.villageId} onChange={update}>
                <option value="">เลือกหมู่บ้าน</option>
                {villages.map((village) => (
                  <option key={village.id} value={village.id}>
                    {village.name || `หมู่ที่ ${village.villageNo}`}
                  </option>
                ))}
              </select>
              <FieldError value={errors.villageId} />
            </label>

            <label className="field field-wide">
              <span>รายละเอียดที่อยู่</span>
              <textarea
                name="addressDetail"
                value={form.addressDetail}
                onChange={update}
                rows={3}
                placeholder="จุดสังเกต ถนน ซอย หรือรายละเอียดเพิ่มเติม"
              />
            </label>
          </div>

          <MapPicker
            latitude={form.latitude}
            longitude={form.longitude}
            required
            onChange={(location) => {
              setForm((current) => ({
                ...current,
                ...location,
              }));
            }}
          />
          <FieldError value={errors.location} />
        </section>

        <section className="form-section">
          <div className="section-title">
            <span>3</span>
            <div>
              <h2>ข้อมูลสัตว์เลี้ยง</h2>
              <p>รองรับสุนัขและแมวในเขตตำบลท่าโพธิ์</p>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>ชื่อสัตว์ *</span>
              <input
                name="petName"
                value={form.petName}
                onChange={update}
                placeholder="ชื่อที่ใช้เรียก"
              />
              <FieldError value={errors.petName} />
            </label>

            <label className="field">
              <span>ประเภท *</span>
              <select name="species" value={form.species} onChange={update}>
                <option value="DOG">สุนัข</option>
                <option value="CAT">แมว</option>
              </select>
            </label>

            <label className="field">
              <span>เพศ</span>
              <select name="sex" value={form.sex} onChange={update}>
                <option value="UNKNOWN">ไม่ระบุ</option>
                <option value="MALE">เพศผู้</option>
                <option value="FEMALE">เพศเมีย</option>
              </select>
            </label>

            <label className="field">
              <span>วันเกิดโดยประมาณ</span>
              <input
                type="date"
                name="birthDate"
                value={form.birthDate}
                onChange={update}
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>

            <label className="field">
              <span>พันธุ์</span>
              <input name="breed" value={form.breed} onChange={update} />
            </label>

            <label className="field">
              <span>สี/ลักษณะเด่น</span>
              <input name="color" value={form.color} onChange={update} />
            </label>

            <label className="field field-wide upload-field">
              <span>รูปสัตว์หรือหลักฐาน</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onAttachment}
              />
              <small>{attachmentName || "JPEG, PNG หรือ WebP ขนาดไม่เกิน 10 MB"}</small>
            </label>
          </div>
        </section>

        {message && <div className="notice notice-error">{message}</div>}

        <div className="form-submit-bar">
          <div>
            <strong>ตรวจข้อมูลก่อนส่ง</strong>
            <span>เมื่อส่งแล้วจะได้รับเลขอ้างอิงสำหรับติดตามผล</span>
          </div>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "กำลังส่งข้อมูล..." : "ส่งคำขอลงทะเบียน"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SuccessPage({ result, onNavigate, onReset }) {
  return (
    <div className="page narrow-page">
      <section className="success-panel">
        <span className="success-check">✓</span>
        <p className="eyebrow">ส่งข้อมูลเรียบร้อย</p>
        <h1>เทศบาลได้รับคำขอแล้ว</h1>
        <p>เก็บเลขอ้างอิงนี้ไว้สำหรับติดตามผลและเชื่อมทะเบียนกับ LINE</p>
        <div className="reference-box">
          <span>เลขอ้างอิง</span>
          <strong>{result?.referenceNo || "—"}</strong>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(result?.referenceNo || "")}
          >
            คัดลอก
          </button>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => onNavigate("track", { reference: result?.referenceNo })}
          >
            ติดตามคำขอนี้
          </button>
          <button type="button" className="button button-secondary" onClick={onReset}>
            ลงทะเบียนอีกตัว
          </button>
        </div>
      </section>
    </div>
  );
}

function TrackPage({
  reference,
  setReference,
  tracking,
  message,
  onSubmit,
}) {
  return (
    <div className="page narrow-page">
      <PageHeading
        eyebrow="ตรวจสอบสถานะ"
        title="ติดตามคำขอ"
        description="กรอกเลขอ้างอิงที่ได้รับหลังส่งคำขอ เช่น TSM-..."
      />

      <form className="tracking-form" onSubmit={onSubmit}>
        <label className="field">
          <span>เลขอ้างอิง</span>
          <div className="input-action">
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value.toUpperCase())}
              placeholder="TSM-..."
              autoCapitalize="characters"
            />
            <button className="button button-primary" type="submit">
              ตรวจสอบ
            </button>
          </div>
        </label>
      </form>

      {message && <div className="notice notice-error">{message}</div>}

      {tracking && (
        <section className="tracking-result">
          <div className="tracking-result-head">
            <div>
              <p className="eyebrow">ผลการติดตาม</p>
              <h2>{tracking.referenceNo}</h2>
            </div>
            <span className={`status-chip ${statusClass(tracking.status)}`}>
              {STATUS_LABELS[tracking.status] || tracking.status}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>วันที่ยื่นคำขอ</dt>
              <dd>{formatDate(tracking.submittedAt)}</dd>
            </div>
            <div>
              <dt>วันที่ตรวจล่าสุด</dt>
              <dd>{formatDate(tracking.reviewedAt)}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

function ExperienceSummary({ experience, onNavigate }) {
  if (!experience?.linked) return null;

  const cards = [
    {
      label: "สัตว์ในทะเบียน",
      value: experience.counts.pets,
      tone: "green",
      action: () => onNavigate("account", { section: "pets" }),
    },
    {
      label: "คำขอรอดำเนินการ",
      value: experience.counts.pending,
      tone: "blue",
      action: () => onNavigate("account", { section: "requests" }),
    },
    {
      label: "ต้องแก้ไขข้อมูล",
      value: experience.counts.needsAttention,
      tone: "orange",
      action: () => onNavigate("account", { section: "attention" }),
    },
    {
      label: "วัคซีนใกล้ครบกำหนด",
      value: experience.counts.vaccinationDue,
      tone: "purple",
      action: () => onNavigate("account", { action: "vaccination" }),
    },
  ];

  return (
    <section className="summary-grid">
      {cards.map((card) => (
        <button
          type="button"
          className={`summary-card tone-${card.tone}`}
          key={card.label}
          onClick={card.action}
        >
          <strong>{Number(card.value || 0).toLocaleString("th-TH")}</strong>
          <span>{card.label}</span>
        </button>
      ))}
    </section>
  );
}

function LinkAccountPanel({ lineSession, linkForm, setLinkForm, busy, onLink }) {
  return (
    <section className="account-link-panel">
      <div className="line-profile">
        {lineSession?.profile?.pictureUrl ? (
          <img src={lineSession.profile.pictureUrl} alt="" />
        ) : (
          <span>LINE</span>
        )}
        <div>
          <p className="eyebrow">เข้าสู่ระบบแล้ว</p>
          <h2>{lineSession?.profile?.displayName || "ผู้ใช้ LINE"}</h2>
          <p>เชื่อมทะเบียนเดิมด้วยเลขอ้างอิงและเบอร์โทรศัพท์</p>
        </div>
      </div>

      <form className="form-grid" onSubmit={onLink}>
        <label className="field">
          <span>เลขอ้างอิงคำขอ</span>
          <input
            value={linkForm.referenceNo}
            onChange={(event) => setLinkForm((current) => ({
              ...current,
              referenceNo: event.target.value.toUpperCase(),
            }))}
            placeholder="TSM-..."
          />
        </label>
        <label className="field">
          <span>เบอร์โทรศัพท์</span>
          <input
            value={linkForm.phone}
            onChange={(event) => setLinkForm((current) => ({
              ...current,
              phone: normalizeThaiPhone(event.target.value),
            }))}
            inputMode="tel"
            maxLength={10}
            placeholder="08xxxxxxxx"
          />
        </label>
        <div className="field field-wide">
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "กำลังเชื่อมทะเบียน..." : "เชื่อมทะเบียนกับ LINE"}
          </button>
        </div>
      </form>
    </section>
  );
}

function AttentionPanel({ experience, myData, onNavigate, onOpenRequest }) {
  if (!experience?.linked) return null;

  const attention = [];
  if (experience.counts.needsAttention > 0) {
    attention.push({
      title: "มีคำขอที่ต้องแก้ไข",
      detail: `${experience.counts.needsAttention} รายการ`,
      button: "ดูและส่งใหม่",
      onClick: () => onNavigate("account", { section: "requests" }),
    });
  }
  if (experience.counts.vaccinationDue > 0) {
    attention.push({
      title: "วัคซีนใกล้ครบกำหนด",
      detail: `${experience.counts.vaccinationDue} ตัว`,
      button: "แจ้งวัคซีน",
      onClick: () => {
        const pet = pickVaccinationPet(myData?.pets || []);
        if (pet) onOpenRequest(pet, "VACCINATION");
      },
    });
  }
  if (experience.counts.unsterilized > 0) {
    attention.push({
      title: "ยังไม่มีประวัติทำหมัน",
      detail: `${experience.counts.unsterilized} ตัว`,
      button: "แจ้งทำหมัน",
      onClick: () => {
        const pet = myData?.pets?.find(
          (item) => item.status === "ACTIVE" && !Number(item.sterilized),
        );
        if (pet) onOpenRequest(pet, "STERILIZATION");
      },
    });
  }
  if (experience.location.missing) {
    attention.push({
      title: "ยังไม่ได้เลือกตำแหน่งบ้าน",
      detail: "ตำแหน่งจำเป็นสำหรับแผนที่และการติดตามพื้นที่",
      button: "เลือกบนแผนที่",
      onClick: () => onNavigate("account", { section: "location" }),
    });
  }

  if (!attention.length) {
    return (
      <section className="all-good-panel">
        <span>✓</span>
        <div>
          <h2>ข้อมูลปัจจุบันครบแล้ว</h2>
          <p>ยังไม่มีรายการเร่งด่วนที่ต้องดำเนินการ</p>
        </div>
      </section>
    );
  }

  return (
    <section className="attention-panel">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">ควรดำเนินการ</p>
          <h2>รายการตามข้อมูลล่าสุด</h2>
        </div>
        <span className="attention-count">{attention.length}</span>
      </div>
      <div className="attention-list">
        {attention.map((item) => (
          <article key={item.title}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </div>
            <button type="button" onClick={item.onClick}>
              {item.button}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PetCard({ pet, submissions, onOpenRequest }) {
  const pendingTypes = new Set(
    submissions
      .filter(
        (item) =>
          item.petId === pet.id &&
          ["SUBMITTED", "UNDER_REVIEW", "NEED_MORE_INFO"].includes(item.status),
      )
      .map((item) => item.subjectType),
  );

  const active = pet.status === "ACTIVE";

  function requestButton(type, label, disabled = false) {
    const pending = pendingTypes.has(type);
    return (
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => onOpenRequest(pet, type)}
      >
        {pending ? "อยู่ระหว่างตรวจสอบ" : label}
      </button>
    );
  }

  return (
    <article className="pet-card">
      <div className="pet-card-head">
        <div className="pet-avatar">{pet.species === "CAT" ? "🐈" : "🐕"}</div>
        <div>
          <h3>{pet.petName}</h3>
          <p>{pet.registrationNo || "รอเลขทะเบียน"}</p>
        </div>
        <span className={`status-chip ${statusClass(pet.status)}`}>
          {STATUS_LABELS[pet.status] || pet.status}
        </span>
      </div>

      <div className="pet-facts">
        <span>
          <small>วัคซีนล่าสุด</small>
          <strong>{formatDate(pet.lastVaccinatedAt)}</strong>
        </span>
        <span>
          <small>ทำหมัน</small>
          <strong>{Number(pet.sterilized) ? "มีประวัติแล้ว" : "ยังไม่มีประวัติ"}</strong>
        </span>
      </div>

      <div className="pet-actions">
        {requestButton("VACCINATION", "แจ้งวัคซีน", !active)}
        {requestButton(
          "STERILIZATION",
          "แจ้งทำหมัน",
          !active || Boolean(Number(pet.sterilized)),
        )}
        {requestButton("PET_UPDATE", "แก้ไขข้อมูล", false)}
        {requestButton("PET_STATUS", "แจ้งสถานะ", false)}
      </div>
    </article>
  );
}

function RequestHistory({ registrations, submissions, onEdit, onCancel }) {
  const rows = [
    ...(registrations || []).map((item) => ({
      ...item,
      id: `registration-${item.referenceNo}`,
      subjectLabel: "ขึ้นทะเบียนสัตว์",
      kind: "REGISTRATION",
    })),
    ...(submissions || []).map((item) => ({
      ...item,
      subjectLabel: SUBJECT_LABELS[item.subjectType] || item.subjectType,
      kind: "SUBMISSION",
    })),
  ].sort(
    (left, right) =>
      new Date(right.submittedAt || 0).getTime() -
      new Date(left.submittedAt || 0).getTime(),
  );

  if (!rows.length) {
    return <div className="empty-state">ยังไม่มีประวัติคำขอ</div>;
  }

  return (
    <div className="request-list">
      {rows.map((item) => (
        <article key={item.id}>
          <div className="request-main">
            <div>
              <strong>{item.subjectLabel}</strong>
              <span>{item.referenceNo}</span>
            </div>
            <span className={`status-chip ${statusClass(item.status)}`}>
              {STATUS_LABELS[item.status] || item.status}
            </span>
          </div>
          <div className="request-meta">
            <span>{formatDate(item.submittedAt)}</span>
            {item.reviewNote && <p>{item.reviewNote}</p>}
          </div>
          {item.kind === "SUBMISSION" && (
            <div className="request-actions">
              {item.status === "NEED_MORE_INFO" && (
                <button type="button" onClick={() => onEdit(item)}>
                  แก้ไขและส่งใหม่
                </button>
              )}
              {["SUBMITTED", "NEED_MORE_INFO"].includes(item.status) && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => onCancel(item)}
                >
                  ยกเลิกคำขอ
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function LocationEditor({ owner, experience, saving, onSave }) {
  const [location, setLocation] = useState(() => ({
    latitude: experience?.location?.latitude ?? owner?.latitude ?? null,
    longitude: experience?.location?.longitude ?? owner?.longitude ?? null,
    addressDetail: owner?.addressDetail || "",
  }));

  useEffect(() => {
    setLocation({
      latitude: experience?.location?.latitude ?? owner?.latitude ?? null,
      longitude: experience?.location?.longitude ?? owner?.longitude ?? null,
      addressDetail: owner?.addressDetail || "",
    });
  }, [
    experience?.location?.latitude,
    experience?.location?.longitude,
    owner?.addressDetail,
    owner?.latitude,
    owner?.longitude,
  ]);

  return (
    <section className="form-section location-editor" id="location-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">ตำแหน่งบ้าน</p>
          <h2>แก้ไขพิกัดบนแผนที่</h2>
          <p>
            {owner?.houseNo} {owner?.villageName}
          </p>
        </div>
        <span className={`status-chip ${experience?.location?.missing ? "status-warning" : "status-success"}`}>
          {experience?.location?.missing ? "ยังไม่ระบุ" : "มีตำแหน่งแล้ว"}
        </span>
      </div>

      <label className="field">
        <span>รายละเอียดที่อยู่</span>
        <textarea
          value={location.addressDetail}
          onChange={(event) => setLocation((current) => ({
            ...current,
            addressDetail: event.target.value,
          }))}
          rows={3}
        />
      </label>

      <MapPicker
        latitude={location.latitude}
        longitude={location.longitude}
        required
        onChange={(value) => setLocation((current) => ({
          ...current,
          ...value,
        }))}
      />

      <button
        type="button"
        className="button button-primary"
        disabled={
          saving ||
          !Number.isFinite(Number(location.latitude)) ||
          !Number.isFinite(Number(location.longitude))
        }
        onClick={() => onSave(location)}
      >
        {saving ? "กำลังบันทึก..." : "บันทึกตำแหน่งบ้าน"}
      </button>
    </section>
  );
}

function AccountPage({
  lineBusy,
  lineSession,
  myData,
  experience,
  linkForm,
  setLinkForm,
  message,
  onConnectLine,
  onLink,
  onNavigate,
  onOpenRequest,
  onEditSubmission,
  onCancelSubmission,
  onSaveLocation,
  locationSaving,
  section,
}) {
  if (!lineSession) {
    return (
      <div className="page narrow-page">
        <PageHeading
          eyebrow="บริการเฉพาะเจ้าของ"
          title="ข้อมูลสัตว์เลี้ยงของฉัน"
          description="เข้าสู่ระบบด้วย LINE เพื่อดูทะเบียน คำขอ และเมนูที่เปลี่ยนตามข้อมูลจริง"
        />
        <section className="line-login-panel">
          <div className="line-logo">LINE</div>
          <h2>เข้าสู่ระบบด้วย LINE</h2>
          <p>
            ระบบจะอ่านเฉพาะข้อมูลยืนยันตัวตน และจะแสดงเฉพาะทะเบียนที่เชื่อมกับบัญชีของคุณ
          </p>
          <button
            type="button"
            className="button button-line"
            disabled={lineBusy}
            onClick={onConnectLine}
          >
            {lineBusy ? "กำลังเปิด LINE..." : "เข้าสู่ระบบด้วย LINE"}
          </button>
        </section>
        {message && <div className="notice notice-error">{message}</div>}
      </div>
    );
  }

  if (!myData?.linked) {
    return (
      <div className="page narrow-page">
        <PageHeading
          eyebrow="เชื่อมบัญชี"
          title="เชื่อมทะเบียนกับ LINE"
          description="ใช้เลขอ้างอิงจากการลงทะเบียนและเบอร์โทรศัพท์เจ้าของ"
        />
        <LinkAccountPanel
          lineSession={lineSession}
          linkForm={linkForm}
          setLinkForm={setLinkForm}
          busy={lineBusy}
          onLink={onLink}
        />
        <button
          type="button"
          className="text-link"
          onClick={() => onNavigate("register")}
        >
          ยังไม่มีทะเบียน — ลงทะเบียนสัตว์เลี้ยงก่อน
        </button>
        {message && <div className="notice notice-error">{message}</div>}
      </div>
    );
  }

  return (
    <div className="page account-page">
      <section className="account-hero">
        <div>
          <p className="eyebrow">บัญชีเจ้าของสัตว์เลี้ยง</p>
          <h1>{myData.owner.fullName}</h1>
          <p>
            บ้านเลขที่ {myData.owner.houseNo} {myData.owner.villageName}
          </p>
        </div>
        <button
          type="button"
          className="button button-light"
          onClick={() => onNavigate("register")}
        >
          + เพิ่มสัตว์เลี้ยง
        </button>
      </section>

      <ExperienceSummary experience={experience} onNavigate={onNavigate} />

      <AttentionPanel
        experience={experience}
        myData={myData}
        onNavigate={onNavigate}
        onOpenRequest={onOpenRequest}
      />

      <section className="account-section" id="pets-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">ทะเบียนของฉัน</p>
            <h2>สัตว์เลี้ยงทั้งหมด</h2>
          </div>
          <span>{myData.pets.length} ตัว</span>
        </div>

        <div className="pet-grid">
          {myData.pets.length ? (
            myData.pets.map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                submissions={myData.submissions || []}
                onOpenRequest={onOpenRequest}
              />
            ))
          ) : (
            <div className="empty-state">ยังไม่มีสัตว์เลี้ยงที่อนุมัติแล้ว</div>
          )}
        </div>
      </section>

      <section className="account-section" id="requests-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">ประวัติการดำเนินการ</p>
            <h2>คำขอของฉัน</h2>
          </div>
        </div>
        <RequestHistory
          registrations={myData.registrations}
          submissions={myData.submissions}
          onEdit={onEditSubmission}
          onCancel={onCancelSubmission}
        />
      </section>

      <LocationEditor
        owner={myData.owner}
        experience={experience}
        saving={locationSaving}
        onSave={onSaveLocation}
      />

      {message && <div className="notice notice-error sticky-notice">{message}</div>}
    </div>
  );
}

function RequestDialog({
  pet,
  type,
  form,
  setForm,
  saving,
  editingSubmission,
  onClose,
  onSubmit,
}) {
  if (!pet || !type) return null;

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">{pet.registrationNo}</p>
            <h2 id="request-title">
              {SUBJECT_LABELS[type]} — {pet.petName}
            </h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="stack-form compact-form" onSubmit={onSubmit}>
          {type === "PET_UPDATE" && (
            <div className="form-grid">
              <label className="field">
                <span>ชื่อสัตว์</span>
                <input name="petName" value={form.petName || ""} onChange={update} required />
              </label>
              <label className="field">
                <span>ประเภท</span>
                <select name="species" value={form.species || "DOG"} onChange={update}>
                  <option value="DOG">สุนัข</option>
                  <option value="CAT">แมว</option>
                </select>
              </label>
              <label className="field">
                <span>เพศ</span>
                <select name="sex" value={form.sex || "UNKNOWN"} onChange={update}>
                  <option value="UNKNOWN">ไม่ระบุ</option>
                  <option value="MALE">เพศผู้</option>
                  <option value="FEMALE">เพศเมีย</option>
                </select>
              </label>
              <label className="field">
                <span>วันเกิด</span>
                <input type="date" name="birthDate" value={form.birthDate || ""} onChange={update} />
              </label>
              <label className="field">
                <span>พันธุ์</span>
                <input name="breed" value={form.breed || ""} onChange={update} />
              </label>
              <label className="field">
                <span>สี</span>
                <input name="color" value={form.color || ""} onChange={update} />
              </label>
              <label className="field field-wide">
                <span>เลขไมโครชิป</span>
                <input name="microchipNo" value={form.microchipNo || ""} onChange={update} />
              </label>
              <label className="field field-wide">
                <span>เหตุผลที่แก้ไข *</span>
                <textarea name="reason" value={form.reason || ""} onChange={update} rows={3} required />
              </label>
            </div>
          )}

          {type === "VACCINATION" && (
            <div className="form-grid">
              <label className="field field-wide">
                <span>ชื่อวัคซีน *</span>
                <input name="vaccineName" value={form.vaccineName || ""} onChange={update} required />
              </label>
              <label className="field">
                <span>วันที่ฉีด *</span>
                <input
                  type="date"
                  name="vaccinatedAt"
                  value={form.vaccinatedAt || ""}
                  onChange={update}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label className="field">
                <span>วันครบกำหนดครั้งถัดไป</span>
                <input type="date" name="nextDueAt" value={form.nextDueAt || ""} onChange={update} />
              </label>
              <label className="field">
                <span>เลขล็อต</span>
                <input name="lotNo" value={form.lotNo || ""} onChange={update} />
              </label>
              <label className="field">
                <span>สถานพยาบาล/ผู้ให้บริการ</span>
                <input name="providerName" value={form.providerName || ""} onChange={update} />
              </label>
            </div>
          )}

          {type === "STERILIZATION" && (
            <div className="form-grid">
              <label className="field">
                <span>วันที่ทำหมัน *</span>
                <input
                  type="date"
                  name="sterilizedAt"
                  value={form.sterilizedAt || ""}
                  onChange={update}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label className="field">
                <span>สถานพยาบาล/ผู้ให้บริการ</span>
                <input name="providerName" value={form.providerName || ""} onChange={update} />
              </label>
              <label className="field field-wide">
                <span>หมายเหตุ</span>
                <textarea name="note" value={form.note || ""} onChange={update} rows={3} />
              </label>
            </div>
          )}

          {type === "PET_STATUS" && (
            <div className="form-grid">
              <label className="field">
                <span>สถานะใหม่ *</span>
                <select name="status" value={form.status || "MISSING"} onChange={update}>
                  <option value="ACTIVE">ปกติ</option>
                  <option value="MISSING">สูญหาย</option>
                  <option value="TRANSFERRED">ย้ายเจ้าของ</option>
                  <option value="DECEASED">เสียชีวิต</option>
                </select>
              </label>
              <label className="field">
                <span>วันที่มีผล *</span>
                <input
                  type="date"
                  name="effectiveAt"
                  value={form.effectiveAt || ""}
                  onChange={update}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label className="field field-wide">
                <span>รายละเอียด/เหตุผล *</span>
                <textarea name="reason" value={form.reason || ""} onChange={update} rows={3} required />
              </label>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving
                ? "กำลังส่ง..."
                : editingSubmission
                  ? "แก้ไขและส่งใหม่"
                  : "ส่งคำขอ"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function initialRequestForm(pet, type) {
  const today = new Date().toISOString().slice(0, 10);

  if (type === "PET_UPDATE") {
    return {
      subjectType: type,
      petName: pet.petName || "",
      species: pet.species || "DOG",
      sex: pet.sex || "UNKNOWN",
      breed: pet.breed || "",
      color: pet.color || "",
      birthDate: pet.birthDate ? String(pet.birthDate).slice(0, 10) : "",
      microchipNo: pet.microchipNo || "",
      reason: "",
    };
  }

  if (type === "VACCINATION") {
    return {
      subjectType: type,
      vaccineName: "วัคซีนป้องกันโรคพิษสุนัขบ้า",
      vaccinatedAt: today,
      nextDueAt: "",
      lotNo: "",
      providerName: "",
    };
  }

  if (type === "STERILIZATION") {
    return {
      subjectType: type,
      sterilizedAt: today,
      providerName: "",
      note: "",
    };
  }

  return {
    subjectType: "PET_STATUS",
    status: pet.status === "MISSING" ? "ACTIVE" : "MISSING",
    effectiveAt: today,
    reason: "",
  };
}

export default function App() {
  const initialRoute = useMemo(routeFromUrl, []);
  const [view, setView] = useState(
    ["home", "register", "track", "account"].includes(initialRoute.view)
      ? initialRoute.view
      : "home",
  );
  const [routeAction, setRouteAction] = useState(initialRoute.action);
  const [routeSection, setRouteSection] = useState(initialRoute.section);

  const [citizenToken, setCitizenToken] = useState(
    () => sessionStorage.getItem("prms_citizen_token") || "",
  );
  const publicApi = useMemo(() => createCitizenApi(), []);
  const citizenApi = useMemo(() => createCitizenApi(citizenToken), [citizenToken]);

  const [villages, setVillages] = useState(FALLBACK_VILLAGES);
  const [form, setForm] = useState(EMPTY_REGISTRATION);
  const [errors, setErrors] = useState({});
  const [registrationKey, setRegistrationKey] = useState(() => crypto.randomUUID());
  const [attachment, setAttachment] = useState(null);
  const [attachmentName, setAttachmentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  const [reference, setReference] = useState("");
  const [tracking, setTracking] = useState(null);

  const [lineSession, setLineSession] = useState(null);
  const [lineBusy, setLineBusy] = useState(false);
  const [myData, setMyData] = useState(null);
  const [experience, setExperience] = useState(null);
  const [linkForm, setLinkForm] = useState({ referenceNo: "", phone: "" });
  const [locationSaving, setLocationSaving] = useState(false);

  const [requestPet, setRequestPet] = useState(null);
  const [requestType, setRequestType] = useState("");
  const [requestForm, setRequestForm] = useState({});
  const [requestSaving, setRequestSaving] = useState(false);
  const [editingSubmission, setEditingSubmission] = useState(null);
  const handledDeepLink = useRef("");

  useEffect(() => {
    publicApi
      .get("/public/villages")
      .then((data) => {
        if (Array.isArray(data) && data.length) setVillages(data);
      })
      .catch(() => {});
  }, [publicApi]);

  useEffect(() => {
    if (view === "account") {
      void connectToLine();
    }
  }, [view]);

  useEffect(() => {
    if (!myData?.linked || !routeAction) return;
    const key = `${routeAction}:${myData.owner?.id || ""}`;
    if (handledDeepLink.current === key) return;

    const type = {
      vaccination: "VACCINATION",
      sterilization: "STERILIZATION",
      status: "PET_STATUS",
      update: "PET_UPDATE",
    }[routeAction];

    if (!type) return;

    const pet = type === "VACCINATION"
      ? pickVaccinationPet(myData.pets)
      : myData.pets.find((item) => {
          if (type === "STERILIZATION") {
            return item.status === "ACTIVE" && !Number(item.sterilized);
          }
          return item.status === "ACTIVE";
        }) || myData.pets[0];

    handledDeepLink.current = key;
    if (pet) openRequest(pet, type);
  }, [myData, routeAction]);

  useEffect(() => {
    if (view !== "account" || !myData?.linked || !routeSection) return;

    const id = {
      attention: "requests-section",
      requests: "requests-section",
      pets: "pets-section",
      location: "location-section",
    }[routeSection];

    if (!id) return;
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 180);
  }, [myData, routeSection, view]);

  function navigate(nextView, extras = {}) {
    setView(nextView);
    setRouteAction(extras.action || "");
    setRouteSection(extras.section || "");
    setMessage("");

    if (extras.reference) setReference(extras.reference);
    setRoute(nextView, extras);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function chooseAttachment(event) {
    const file = event.target.files?.[0];
    setMessage("");

    if (!file) {
      setAttachment(null);
      setAttachmentName("");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      event.target.value = "";
      setMessage("รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      event.target.value = "";
      setMessage("ไฟล์ต้องมีขนาดไม่เกิน 10 MB");
      return;
    }

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ได้"));
      reader.readAsDataURL(file);
    });

    setAttachment({
      fileName: file.name,
      mimeType: file.type,
      base64,
    });
    setAttachmentName(
      `${file.name} · ${Math.ceil(file.size / 1024).toLocaleString("th-TH")} KB`,
    );
  }

  async function submitRegistration(event) {
    event.preventDefault();

    const check = validatePetRegistration(form);
    const nextErrors = { ...check.errors };

    if (
      !Number.isFinite(Number(form.latitude)) ||
      !Number.isFinite(Number(form.longitude))
    ) {
      nextErrors.location = "กรุณาเลือกตำแหน่งบ้านบนแผนที่";
    }

    setErrors(nextErrors);
    if (!check.valid || nextErrors.location) return;

    setSaving(true);
    setMessage("");

    try {
      const data = await publicApi.post(
        "/public/registrations",
        {
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          ...(attachment ? { attachment } : {}),
        },
        { "Idempotency-Key": registrationKey },
      );

      setResult(data);
      setView("success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message || "ไม่สามารถส่งข้อมูลได้");
    } finally {
      setSaving(false);
    }
  }

  function resetRegistration() {
    setForm(EMPTY_REGISTRATION);
    setErrors({});
    setAttachment(null);
    setAttachmentName("");
    setResult(null);
    setRegistrationKey(crypto.randomUUID());
    navigate("register");
  }

  async function trackRegistration(event) {
    event?.preventDefault();
    setMessage("");
    setTracking(null);

    if (!reference.trim()) {
      setMessage("กรุณากรอกเลขอ้างอิง");
      return;
    }

    try {
      const data = await publicApi.get(
        `/public/registrations/${encodeURIComponent(reference.trim())}`,
      );
      setTracking(data);
    } catch (error) {
      setMessage(error.message || "ไม่พบคำขอ");
    }
  }

  async function loadAccountData(token = citizenToken, syncMenu = true) {
    if (!token) return null;
    const api = createCitizenApi(token);

    const [account, state] = await Promise.all([
      api.get("/citizen/me"),
      api.get("/citizen/experience"),
    ]);

    setMyData(account);
    setExperience(state);

    if (syncMenu) {
      api.post("/citizen/line/sync-rich-menu", {}).catch(() => {});
    }

    return { account, state };
  }

  async function connectToLine() {
    if (lineBusy) return;
    setLineBusy(true);
    setMessage("");

    try {
      const session = await connectLine(publicApi);
      if (!session) return;

      setLineSession(session);
      setCitizenToken(session.token);
      sessionStorage.setItem("prms_citizen_token", session.token);

      if (session.linked) {
        await loadAccountData(session.token);
      } else {
        setMyData({ linked: false, pets: [], registrations: [], submissions: [] });
        setExperience({
          linked: false,
          menuKey: "guest",
          counts: {
            pets: 0,
            pending: 0,
            needsAttention: 0,
            vaccinationDue: 0,
            unsterilized: 0,
            missingPets: 0,
          },
          location: { latitude: null, longitude: null, missing: true },
        });
      }
    } catch (error) {
      setMessage(error.message || "ไม่สามารถเชื่อมต่อ LINE ได้");
    } finally {
      setLineBusy(false);
    }
  }

  async function linkOwner(event) {
    event.preventDefault();
    setLineBusy(true);
    setMessage("");

    try {
      const data = await citizenApi.post("/citizen/line/link", linkForm);
      setCitizenToken(data.token);
      sessionStorage.setItem("prms_citizen_token", data.token);
      setLineSession((current) => ({ ...current, linked: true, token: data.token }));
      await loadAccountData(data.token);
    } catch (error) {
      setMessage(error.message || "ไม่สามารถเชื่อมทะเบียนได้");
    } finally {
      setLineBusy(false);
    }
  }

  function openRequest(pet, type, suppliedForm = null, submission = null) {
    setRequestPet(pet);
    setRequestType(type);
    setRequestForm(suppliedForm || initialRequestForm(pet, type));
    setEditingSubmission(submission);
    setMessage("");
  }

  function closeRequest(force = false) {
    if (requestSaving && !force) return;
    setRequestPet(null);
    setRequestType("");
    setRequestForm({});
    setEditingSubmission(null);
  }

  async function submitPetRequest(event) {
    event.preventDefault();
    if (!requestPet || !requestType) return;

    setRequestSaving(true);
    setMessage("");

    try {
      let data;
      if (editingSubmission) {
        data = await citizenApi.patch(
          `/citizen/submissions/${editingSubmission.id}/resubmit`,
          {
            ...requestForm,
            subjectType: requestType,
            version: editingSubmission.version,
          },
        );
      } else {
        data = await citizenApi.post(
          `/citizen/pets/${requestPet.id}/submissions`,
          {
            ...requestForm,
            subjectType: requestType,
          },
        );
      }

      closeRequest(true);
      await loadAccountData(citizenToken);
      setMessage(`ส่งคำขอ ${data.referenceNo} เรียบร้อยแล้ว`);
    } catch (error) {
      setMessage(error.message || "ไม่สามารถส่งคำขอได้");
    } finally {
      setRequestSaving(false);
    }
  }

  async function editSubmission(submission) {
    setMessage("");

    try {
      const detail = await citizenApi.get(
        `/citizen/submissions/${submission.id}`,
      );
      const pet = myData.pets.find((item) => item.id === detail.petId);
      if (!pet) throw new Error("ไม่พบสัตว์ที่เกี่ยวข้องกับคำขอ");

      openRequest(
        pet,
        detail.subjectType,
        detail.proposedPayload,
        detail,
      );
    } catch (error) {
      setMessage(error.message || "ไม่สามารถเปิดคำขอได้");
    }
  }

  async function cancelSubmission(submission) {
    const confirmed = window.confirm(
      `ยืนยันยกเลิกคำขอ ${submission.referenceNo} หรือไม่`,
    );
    if (!confirmed) return;

    setMessage("");

    try {
      await citizenApi.patch(
        `/citizen/submissions/${submission.id}/cancel`,
        { version: submission.version },
      );
      await loadAccountData(citizenToken);
      setMessage(`ยกเลิกคำขอ ${submission.referenceNo} แล้ว`);
    } catch (error) {
      setMessage(error.message || "ไม่สามารถยกเลิกคำขอได้");
    }
  }

  async function saveLocation(location) {
    setLocationSaving(true);
    setMessage("");

    try {
      await citizenApi.patch("/citizen/location", {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        addressDetail: location.addressDetail || "",
      });
      await loadAccountData(citizenToken);
      setMessage("บันทึกตำแหน่งบ้านเรียบร้อยแล้ว");
    } catch (error) {
      setMessage(error.message || "ไม่สามารถบันทึกตำแหน่งได้");
    } finally {
      setLocationSaving(false);
    }
  }

  let content;

  if (view === "register") {
    content = (
      <RegistrationPage
        form={form}
        setForm={setForm}
        errors={errors}
        villages={villages}
        saving={saving}
        message={message}
        attachmentName={attachmentName}
        onAttachment={chooseAttachment}
        onSubmit={submitRegistration}
      />
    );
  } else if (view === "success") {
    content = (
      <SuccessPage
        result={result}
        onNavigate={navigate}
        onReset={resetRegistration}
      />
    );
  } else if (view === "track") {
    content = (
      <TrackPage
        reference={reference}
        setReference={setReference}
        tracking={tracking}
        message={message}
        onSubmit={trackRegistration}
      />
    );
  } else if (view === "account") {
    content = (
      <AccountPage
        lineBusy={lineBusy}
        lineSession={lineSession}
        myData={myData}
        experience={experience}
        linkForm={linkForm}
        setLinkForm={setLinkForm}
        message={message}
        onConnectLine={connectToLine}
        onLink={linkOwner}
        onNavigate={navigate}
        onOpenRequest={openRequest}
        onEditSubmission={editSubmission}
        onCancelSubmission={cancelSubmission}
        onSaveLocation={saveLocation}
        locationSaving={locationSaving}
        section={routeSection}
      />
    );
  } else {
    content = <HomePage onNavigate={navigate} />;
  }

  return (
    <Shell
      onNavigate={navigate}
      activeView={view === "success" ? "register" : view}
    >
      {content}
      <RequestDialog
        pet={requestPet}
        type={requestType}
        form={requestForm}
        setForm={setRequestForm}
        saving={requestSaving}
        editingSubmission={editingSubmission}
        onClose={closeRequest}
        onSubmit={submitPetRequest}
      />
      <footer className="citizen-footer">
        <strong>{ORGANIZATION.shortName || "เทศบาลเมืองท่าโพธิ์"}</strong>
        <span>ระบบทะเบียนและติดตามสัตว์เลี้ยง PRMS-TSM</span>
      </footer>
    </Shell>
  );
}

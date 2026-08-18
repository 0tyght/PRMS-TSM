import { useCallback, useEffect, useMemo, useState } from "react";

import { createWasteApplication } from "../composition-root/createWasteApplication.js";
import { ErrorNotice, LoadingState, PageHead } from "../components/ui.jsx";

const LABELS = Object.freeze({
  CITIZEN: {
    title: "LINE OA สำหรับประชาชน",
    detail: "ใช้สำหรับบริการประชาชน การลงทะเบียน การแจ้งเตือน และบริการเก็บขยะของประชาชน",
    accent: "ประชาชน",
  },
  DRIVER: {
    title: "LINE OA สำหรับพนักงานประจำรถขยะ",
    detail: "ใช้สำหรับยืนยันตัวตน งานที่ได้รับมอบหมาย การยืนยันจุดเก็บ และการแจ้งเหตุของพนักงาน",
    accent: "พนักงาน",
  },
});

function sourceLabel(source) {
  if (source === "DATABASE") return "ตั้งค่าจากหน้าเว็บ";
  if (source === "ENV") return "ใช้ค่าตั้งต้นจากเซิร์ฟเวอร์";
  return "ยังไม่ได้ตั้งค่า";
}

function formatTestedAt(value) {
  if (!value) return "ยังไม่เคยทดสอบ";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "ยังไม่เคยทดสอบ"
    : new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(date);
}

function ChannelCard({ channel, draft, onChange, onTest, onSave, onWebhook, busy, feedback }) {
  const labels = LABELS[channel.kind] || LABELS.CITIZEN;
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const statusClass = channel.enabled && channel.configured
    ? "is-ready"
    : channel.enabled
      ? "is-warning"
      : "is-disabled";
  const statusLabel = channel.enabled && channel.configured
    ? "พร้อมใช้งาน"
    : channel.enabled
      ? "ตั้งค่ายังไม่ครบ"
      : "ปิดใช้งาน";

  return (
    <article className="waste-line-settings-card">
      <header className="waste-line-settings-card__head">
        <div>
          <span className="waste-line-settings-card__audience">{labels.accent}</span>
          <h2>{labels.title}</h2>
          <p>{labels.detail}</p>
        </div>
        <span className={`waste-line-connection ${statusClass}`}><i />{statusLabel}</span>
      </header>

      <div className="waste-line-settings-meta">
        <div><small>ชื่อบัญชี</small><strong>{channel.displayName || "ยังไม่ทราบ — กดทดสอบการเชื่อมต่อ"}</strong></div>
        <div><small>Basic ID</small><strong>{channel.basicId || "-"}</strong></div>
        <div><small>แหล่งการตั้งค่า</small><strong>{sourceLabel(channel.source)}</strong></div>
        <div><small>ทดสอบล่าสุด</small><strong>{formatTestedAt(channel.lastTestedAt)}</strong></div>
      </div>

      <div className="waste-line-settings-form">
        <label>
          <span>Channel ID</span>
          <input
            value={draft.channelId}
            onChange={(event) => onChange({ channelId: event.target.value })}
            placeholder="เช่น 2001234567"
            autoComplete="off"
          />
          <small>คัดลอกจาก Messaging API Channel ใน LINE Developers</small>
        </label>

        <label>
          <span>Channel Secret</span>
          <div className="waste-secret-input">
            <input
              type={showSecret ? "text" : "password"}
              value={draft.channelSecret}
              onChange={(event) => onChange({ channelSecret: event.target.value })}
              placeholder={channel.hasChannelSecret ? "ตั้งค่าแล้ว — กรอกใหม่เฉพาะเมื่อต้องการเปลี่ยน" : "กรอก Channel Secret"}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowSecret((value) => !value)} disabled={!draft.channelSecret}>
              {showSecret ? "ซ่อน" : "แสดง"}
            </button>
          </div>
          <small>ระบบไม่ส่งค่าที่บันทึกไว้กลับมาที่เบราว์เซอร์</small>
        </label>

        <label className="waste-line-settings-form__wide">
          <span>Channel Access Token</span>
          <div className="waste-secret-input">
            <input
              type={showToken ? "text" : "password"}
              value={draft.channelAccessToken}
              onChange={(event) => onChange({ channelAccessToken: event.target.value })}
              placeholder={channel.hasAccessToken ? "ตั้งค่าแล้ว — กรอกใหม่เฉพาะเมื่อต้องการเปลี่ยน" : "กรอก Channel Access Token"}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowToken((value) => !value)} disabled={!draft.channelAccessToken}>
              {showToken ? "ซ่อน" : "แสดง"}
            </button>
          </div>
          <small>ใช้สำหรับเรียก Messaging API ระบบจะเข้ารหัสก่อนเก็บลงฐานข้อมูล</small>
        </label>
      </div>

      <label className="waste-line-toggle">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        <span><strong>เปิดใช้งานช่องทางนี้</strong><small>เมื่อปิด ระบบจะไม่รับ webhook หรือส่งข้อความด้วย OA นี้</small></span>
      </label>

      <div className="waste-line-webhook-box">
        <div>
          <small>Webhook endpoint ของช่องทางนี้</small>
          <code>{channel.webhookPath}</code>
        </div>
        <button type="button" className="waste-button waste-button--secondary" disabled={busy || !channel.configured} onClick={onWebhook}>
          ตั้งค่า Webhook อัตโนมัติ
        </button>
      </div>

      {feedback ? <p className={`waste-line-feedback ${feedback.type === "error" ? "is-error" : feedback.type === "warning" ? "is-warning" : "is-success"}`} role="status">{feedback.message}</p> : null}

      <footer className="waste-line-settings-card__actions">
        <button type="button" className="waste-button waste-button--secondary" disabled={busy} onClick={onTest}>
          {busy === "test" ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}
        </button>
        <button type="button" className="waste-button waste-button--primary" disabled={busy} onClick={onSave}>
          {busy === "save" ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
        </button>
      </footer>
    </article>
  );
}

export default function LineSettingsPage({ token }) {
  const api = useMemo(() => createWasteApplication(token), [token]);
  const [channels, setChannels] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [feedback, setFeedback] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get("/api/admin/settings/line");
      const list = Array.isArray(result) ? result : [];
      setChannels(list);
      setDrafts(Object.fromEntries(list.map((channel) => [channel.kind, {
        channelId: channel.channelId || "",
        channelSecret: "",
        channelAccessToken: "",
        enabled: channel.enabled !== false,
      }])));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  function changeDraft(kind, changes) {
    setDrafts((current) => ({
      ...current,
      [kind]: { ...current[kind], ...changes },
    }));
  }

  async function run(kind, action) {
    const draft = drafts[kind];
    setBusy((current) => ({ ...current, [kind]: action }));
    setFeedback((current) => ({ ...current, [kind]: null }));
    try {
      if (action === "test") {
        const result = await api.post(`/api/admin/settings/line/${kind}/test`, draft);
        setFeedback((current) => ({
          ...current,
          [kind]: { type: "success", message: `เชื่อมต่อสำเร็จ — ${result.displayName || result.basicId || "LINE OA"}` },
        }));
        return;
      }

      if (action === "save") {
        const saved = await api.put(`/api/admin/settings/line/${kind}`, draft);
        setChannels((current) => current.map((item) => item.kind === kind ? saved : item));
        setDrafts((current) => ({
          ...current,
          [kind]: { channelId: saved.channelId || "", channelSecret: "", channelAccessToken: "", enabled: saved.enabled !== false },
        }));
        setFeedback((current) => ({ ...current, [kind]: { type: "success", message: "บันทึกและเปิดใช้ค่าล่าสุดแล้ว ไม่ต้อง restart server" } }));
        return;
      }

      if (action === "webhook") {
        const result = await api.post(`/api/admin/settings/line/${kind}/webhook`, {});
        setFeedback((current) => ({
          ...current,
          [kind]: result.warning
            ? { type: "warning", message: `${result.warning} — ${result.endpoint}` }
            : { type: "success", message: `ตั้งค่าและทดสอบ Webhook สำเร็จ: ${result.endpoint}` },
        }));
      }
    } catch (requestError) {
      setFeedback((current) => ({ ...current, [kind]: { type: "error", message: requestError.message } }));
    } finally {
      setBusy((current) => ({ ...current, [kind]: null }));
    }
  }

  return (
    <>
      <PageHead
        eyebrow="SYSTEM SETTINGS"
        title="การเชื่อมต่อ LINE Official Account"
        detail="จัดการ LINE OA สำหรับประชาชนและพนักงานแยกกัน โดยไม่ต้องแก้ source code หรือเปิดไฟล์ .env ทุกครั้งที่เปลี่ยนบัญชี"
      />

      <section className="waste-line-security-note" aria-label="ข้อควรทราบด้านความปลอดภัย">
        <strong>ข้อมูลลับไม่ถูกแสดงย้อนหลัง</strong>
        <p>Channel Secret และ Access Token จะถูกเข้ารหัสก่อนเก็บในฐานข้อมูล หน้าเว็บจะแสดงเพียงว่ามีการตั้งค่าแล้ว หากต้องการเปลี่ยนให้กรอกค่าใหม่เท่านั้น</p>
      </section>

      {error ? <ErrorNotice error={error} onRetry={() => void load()} /> : null}
      {loading ? <LoadingState label="กำลังโหลดการตั้งค่า LINE" /> : null}

      {!loading && !error ? (
        <section className="waste-line-settings-grid">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.kind}
              channel={channel}
              draft={drafts[channel.kind] || { channelId: "", channelSecret: "", channelAccessToken: "", enabled: true }}
              onChange={(changes) => changeDraft(channel.kind, changes)}
              onTest={() => void run(channel.kind, "test")}
              onSave={() => void run(channel.kind, "save")}
              onWebhook={() => void run(channel.kind, "webhook")}
              busy={busy[channel.kind]}
              feedback={feedback[channel.kind]}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

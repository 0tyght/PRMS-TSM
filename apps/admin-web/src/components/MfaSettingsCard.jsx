import { useEffect, useState } from "react";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

export default function MfaSettingsCard({
  api,
  onError,
}) {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let active = true;

    api
      .get("/api/auth/mfa/status")
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((error) => {
        if (active) onError(error.message);
      });

    return () => {
      active = false;
    };
  }, [api, onError]);

  const start = async () => {
    setBusy("setup");

    try {
      setSetup(
        await api.post("/api/auth/mfa/setup", {}),
      );
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy("");
    }
  };

  const enable = async () => {
    setBusy("enable");

    try {
      await api.post("/api/auth/mfa/enable", {
        code,
      });
      setStatus({ enabled: true });
      setSetup(null);
      setCode("");
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <article className="settings-security-card">
      <div className="settings-security-card__icon">
        <ShieldIcon />
      </div>

      <div className="settings-security-card__copy">
        <span>Account Security</span>
        <h2>การยืนยันตัวตนสองขั้นตอน</h2>
        <p>
          {status?.enabled
            ? "บัญชีนี้ได้รับการปกป้องด้วยรหัสจากแอป Authenticator ทุกครั้งที่เข้าสู่ระบบ"
            : "เพิ่มการป้องกันบัญชีเจ้าหน้าที่ด้วยรหัสแบบใช้ครั้งเดียว นอกเหนือจากรหัสผ่าน"}
        </p>

        <div className="settings-security-features">
          <span>ลดความเสี่ยงจากรหัสผ่านรั่วไหล</span>
          <span>รองรับแอป Authenticator มาตรฐาน</span>
        </div>
      </div>

      <div className="settings-security-card__action">
        {status === null ? (
          <span className="settings-security-state is-loading">
            กำลังตรวจสอบ
          </span>
        ) : status.enabled ? (
          <span className="settings-security-state is-enabled">
            <i />
            เปิดใช้งานแล้ว
          </span>
        ) : setup ? (
          <div className="settings-mfa-setup">
            <div>
              <span>Secret key</span>
              <code>{setup.secret}</code>
              <small>
                เพิ่มรหัสนี้ในแอป Authenticator
              </small>
            </div>

            <label>
              รหัสยืนยัน 6 หลัก
              <input
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6),
                  )
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </label>

            <div className="settings-mfa-setup__buttons">
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setSetup(null);
                  setCode("");
                }}
                disabled={Boolean(busy)}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="is-primary"
                onClick={() => void enable()}
                disabled={
                  code.length !== 6 ||
                  Boolean(busy)
                }
              >
                {busy === "enable"
                  ? "กำลังยืนยัน…"
                  : "ยืนยันและเปิด MFA"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="settings-security-enable"
            onClick={() => void start()}
            disabled={Boolean(busy)}
          >
            {busy === "setup"
              ? "กำลังเตรียมการ…"
              : "ตั้งค่า MFA"}
          </button>
        )}
      </div>
    </article>
  );
}

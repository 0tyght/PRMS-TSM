import { useState } from "react";
import { SMART_THA_PHO } from "../config/systems.js";
import SystemPicker from "../components/platform/SystemPicker.jsx";
import { createApi } from "@smart-thapho/web-core/api";

export default function PlatformLoginPage({ onLogin }) {
  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");

  async function submit(event) {
    event.preventDefault();

    if (!selectedSystemId) {
      setError("กรุณาเลือกเว็บระบบที่ต้องการใช้งาน");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = challengeToken
        ? await createApi(null).post("/api/auth/mfa/verify", { challengeToken, code })
        : await createApi(null).post("/api/auth/login", { email, password });

      if (data.mfaRequired) {
        setChallengeToken(data.challengeToken);
        return;
      }

      sessionStorage.setItem("smart_thapho_access_token", data.token);
      sessionStorage.setItem("smart_thapho_active_system", selectedSystemId);
      onLogin(data.token, selectedSystemId);
    } catch (requestError) {
      setError(requestError.message || "ไม่สามารถเข้าสู่ระบบได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="platform-login-page">
      <section className="platform-login-page__intro">
        <div className="platform-brand platform-brand--light">
          <span className="platform-brand__mark">ทพ</span>
          <span>
            <strong>{SMART_THA_PHO.productName}</strong>
            <small>{SMART_THA_PHO.municipalityName}</small>
          </span>
        </div>
        <div className="platform-login-page__copy">
          <p>Municipal Service Platform</p>
          <h1>ศูนย์กลางระบบงาน<br />เทศบาลท่าโพธ์</h1>
          <span>ใช้บัญชีเจ้าหน้าที่เดียว เพื่อเข้าสู่ระบบงานที่ได้รับสิทธิ์</span>
        </div>
        <footer>Smart Tha Pho · Staff Portal</footer>
      </section>

      <section className="platform-login-page__form-area">
        <div className="platform-login-card">
          <div className="platform-login-card__heading">
            <p>สำหรับเจ้าหน้าที่เทศบาล</p>
            <h2>{challengeToken ? "ยืนยันตัวตนสองขั้นตอน" : "เข้าสู่ระบบ"}</h2>
            <span>{challengeToken ? "กรอกรหัส 6 หลักจากแอป Authenticator" : "เลือกเว็บระบบก่อนกรอกบัญชีผู้ใช้งาน"}</span>
          </div>

          {!challengeToken && (
            <SystemPicker
              selectedSystemId={selectedSystemId}
              onSelect={(systemId) => {
                setSelectedSystemId(systemId);
                setError("");
              }}
              compact
            />
          )}

          <form onSubmit={submit}>
            {challengeToken ? (
              <label>
                รหัสยืนยัน
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="\d{6}"
                  required
                  autoFocus
                />
              </label>
            ) : (
              <>
                <label>
                  อีเมล
                  <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                <label>
                  รหัสผ่าน
                  <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" required />
                </label>
              </>
            )}

            {error && <div className="platform-login-card__error" role="alert">{error}</div>}

            <button type="submit" disabled={busy}>
              {busy ? "กำลังตรวจสอบ…" : challengeToken ? "ยืนยันรหัส" : "เข้าสู่ระบบ"}
            </button>

            {challengeToken && (
              <button type="button" className="platform-login-card__secondary" onClick={() => {
                setChallengeToken("");
                setCode("");
                setError("");
              }}>
                กลับไปกรอกรหัสผ่าน
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}

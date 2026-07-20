import { useEffect, useState } from "react";

export default function MfaSettingsCard({ api, onError }) {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  useEffect(() => { api.get("/api/auth/mfa/status").then(setStatus).catch((error) => onError(error.message)); }, [api, onError]);
  const start = async () => { try { setSetup(await api.post("/api/auth/mfa/setup", {})); } catch (error) { onError(error.message); } };
  const enable = async () => { try { await api.post("/api/auth/mfa/enable", { code }); setStatus({ enabled: true }); setSetup(null); setCode(""); } catch (error) { onError(error.message); } };
  return <article className="panel core-panel mfa-panel"><div><h2>การยืนยันตัวตนสองขั้นตอน (MFA)</h2><p>{status?.enabled ? "บัญชีนี้ต้องใช้รหัสจากแอป Authenticator ทุกครั้งที่เข้าสู่ระบบ" : "เพิ่มความปลอดภัยให้บัญชีเจ้าหน้าที่ด้วยรหัสแบบใช้ครั้งเดียว"}</p></div>{status?.enabled ? <span className="badge green">เปิดใช้งานแล้ว</span> : setup ? <div className="mfa-setup"><b>เพิ่มรหัสนี้ในแอป Authenticator</b><code>{setup.secret}</code><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="รหัสยืนยัน 6 หลัก"/><button type="button" onClick={enable} disabled={code.length !== 6}>ยืนยันและเปิด MFA</button></div> : <button type="button" className="refresh-btn" onClick={start}>ตั้งค่า MFA</button>}</article>;
}

import { useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { createApi, IS_TEMPORARY_PASSWORD_BYPASS } from "../lib/api.js";

export default function LoginPage({ onLogin }) {
  const passwordOptional = IS_TEMPORARY_PASSWORD_BYPASS;
  const [email,setEmail]=useState("admin@thapho.go.th");const[password,setPassword]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);
  async function submit(event){event.preventDefault();setBusy(true);setError("");try{const endpoint=passwordOptional&&!password?"/api/auth/dev-login":"/api/auth/login";const data=await createApi(null).post(endpoint,{email,password});sessionStorage.setItem("prms_access_token",data.token);onLogin(data.token)}catch(err){setError(err.message||"ไม่สามารถเข้าสู่ระบบได้")}finally{setBusy(false)}}
  return <main className="login-page"><section className="login-card"><div className="login-brand">ทพ</div><p className="eyebrow">{ORGANIZATION.productName}</p><h1>เข้าสู่ระบบเจ้าหน้าที่</h1><p>{ORGANIZATION.shortName}</p><form onSubmit={submit}><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" required={!passwordOptional} placeholder="กรอกรหัสผ่าน"/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?"กำลังตรวจสอบ…":"เข้าสู่ระบบ"}</button></form><small>สำหรับเจ้าหน้าที่ผู้ได้รับอนุญาตเท่านั้น</small></section></main>;
}

import { useState } from "react";
import { ORGANIZATION } from "@prms/shared";
import { createApi, IS_GITHUB_DEMO } from "../lib/api.js";

export default function LoginPage({ onLogin }) {
  const passwordOptional = import.meta.env.DEV || IS_GITHUB_DEMO;
  const [email,setEmail]=useState("admin@thapho.go.th");const[password,setPassword]=useState("");const[error,setError]=useState("");const[busy,setBusy]=useState(false);
  async function submit(event){event.preventDefault();setBusy(true);setError("");try{if(IS_GITHUB_DEMO&&!password){sessionStorage.setItem("prms_access_token","github-pages-demo");onLogin("github-pages-demo");return}const endpoint=passwordOptional&&!password?"/api/auth/dev-login":"/api/auth/login";const data=await createApi(null).post(endpoint,{email,password});sessionStorage.setItem("prms_access_token",data.token);onLogin(data.token)}catch(err){setError(err.message||"ไม่สามารถเข้าสู่ระบบได้")}finally{setBusy(false)}}
  return <main className="login-page"><section className="login-card"><div className="login-brand">ทพ</div><p className="eyebrow">{ORGANIZATION.productName}</p><h1>เข้าสู่ระบบเจ้าหน้าที่</h1><p>{ORGANIZATION.shortName}</p><form onSubmit={submit}><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>รหัสผ่าน {passwordOptional&&<span className="optional">ไม่ต้องกรอกในช่วงพัฒนา</span>}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" required={!passwordOptional} placeholder={passwordOptional?"เว้นว่างเพื่อเข้าสู่ระบบ":"กรอกรหัสผ่าน"}/></label>{error&&<div className="login-error">{error}</div>}<button disabled={busy}>{busy?"กำลังตรวจสอบ…":"เข้าสู่ระบบ"}</button></form><small>{passwordOptional?"เว็บไซต์สาธิตสำหรับตรวจสอบระบบก่อนเปิดใช้งานจริง":"สำหรับเจ้าหน้าที่ผู้ได้รับอนุญาตเท่านั้น"}</small></section></main>;
}

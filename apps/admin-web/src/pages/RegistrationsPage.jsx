import { useEffect, useMemo, useState } from "react";
import { createApi } from "../lib/api.js";
import { EmptyState, Notice, PageHead } from "../components/common/PageUI.jsx";

const labels={SUBMITTED:"รอตรวจสอบ",UNDER_REVIEW:"กำลังตรวจ",NEED_MORE_INFO:"ขอข้อมูลเพิ่ม",APPROVED:"อนุมัติแล้ว",REJECTED:"ไม่อนุมัติ"};
const thaiDate=value=>value?new Date(value).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"}):"—";

export default function RegistrationsPage({token}){
  const api=useMemo(()=>createApi(token),[token]);const[rows,setRows]=useState([]);const[filter,setFilter]=useState("");const[busy,setBusy]=useState("");const[message,setMessage]=useState("");
  const load=()=>api.get(`/api/admin/registrations${filter?`?status=${filter}`:""}`).then(data=>setRows(Array.isArray(data)?data:[])).catch(e=>setMessage(e.message));
  useEffect(load,[filter,api]);
  async function change(id,status){setBusy(id+status);setMessage("");try{await api.patch(`/api/admin/registrations/${id}/status`,{status});await load()}catch(e){setMessage(e.message)}finally{setBusy("")}}
  return <><PageHead eyebrow="งานทะเบียน" title="คำขอขึ้นทะเบียน" detail="ตรวจสอบข้อมูลจาก LINE และช่องทางออนไลน์ก่อนออกเลขทะเบียน" actions={<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">ทุกสถานะ</option>{Object.entries(labels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>}/><Notice message={message}/><article className="panel module-panel">{!rows.length?<EmptyState text="ไม่มีคำขอในสถานะที่เลือก"/>:<div className="table-wrap"><table><thead><tr><th>เลขที่คำขอ</th><th>เจ้าของ / สัตว์</th><th>หมู่</th><th>ยื่นเมื่อ</th><th>สถานะ</th><th>ดำเนินการ</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.referenceNo}</b></td><td><div className="pet-cell"><i>{r.species==="DOG"?"ส":"ม"}</i><span><b>{r.petName}</b><small>{r.ownerName}</small></span></div></td><td>{r.villageNo}</td><td>{thaiDate(r.submittedAt)}</td><td><span className={`badge ${r.status==="APPROVED"?"green":r.status==="REJECTED"?"gray":"amber"}`}>{labels[r.status]||r.status}</span></td><td><div className="action-group">{!["APPROVED","REJECTED"].includes(r.status)&&<><button disabled={busy} onClick={()=>change(r.id,"UNDER_REVIEW")}>รับตรวจ</button><button className="approve" disabled={busy} onClick={()=>change(r.id,"APPROVED")}>อนุมัติ</button><button className="reject" disabled={busy} onClick={()=>change(r.id,"REJECTED")}>ไม่อนุมัติ</button></>}</div></td></tr>)}</tbody></table></div>}</article></>;
}

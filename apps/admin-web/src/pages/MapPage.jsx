import { useEffect, useMemo, useState } from "react";
import { createApi } from "../lib/api.js";
import DashboardMap from "../components/DashboardMap.jsx";
import { PageHead } from "../components/common/PageUI.jsx";
export default function MapPage({token}){const api=useMemo(()=>createApi(token),[token]);const[items,setItems]=useState([]);const[villages,setVillages]=useState([]);useEffect(()=>{let active=true;Promise.all([api.get("/api/admin/map"),api.get("/api/admin/reports/villages")]).then(([a,b])=>{if(active){setItems(Array.isArray(a)?a:[]);setVillages(Array.isArray(b)?b:[])}}).catch(()=>{if(active){setItems([]);setVillages([])}});return()=>{active=false}},[api]);return <><PageHead eyebrow="ข้อมูลเชิงพื้นที่" title="แผนที่สัตว์ขึ้นทะเบียน" detail="ภาพรวมตำแหน่งสัตว์และจำนวนรายหมู่บ้าน"/><DashboardMap items={items} villages={villages}/></>}

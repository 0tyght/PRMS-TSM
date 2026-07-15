import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fallbackPosition, MAP_BOUNDS, MAP_VILLAGES } from "../lib/mapData.js";

function colorForCount(total,max){const t=max?total/max:0;const a=[220,243,231],b=[11,104,71];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(",")})`}
function popupNode(item){const node=document.createElement("div");node.className="map-popup";const title=document.createElement("b");title.textContent=`${item.petName} · ${item.species==="DOG"?"สุนัข":"แมว"}`;const owner=document.createElement("span");owner.textContent=`เจ้าของ: ${item.ownerName}`;const home=document.createElement("span");home.textContent=`บ้านเลขที่ ${item.houseNo} หมู่ ${item.villageNo}`;const service=document.createElement("small");service.textContent=`วัคซีน ${item.vaccinated?"✓":"–"} · ทำหมัน ${item.sterilized?"✓":"–"}`;node.append(title,owner,home,service);return node}

export default function DashboardMap({items=[],villages=[]}){
  const elementRef=useRef(null);
  const mapRef=useRef(null);
  const dataLayerRef=useRef(null);
  useEffect(()=>{
    if(!elementRef.current)return;
    const map=L.map(elementRef.current,{zoomControl:true,scrollWheelZoom:false,minZoom:13,maxZoom:19}).fitBounds(L.latLngBounds(MAP_BOUNDS).pad(.22));
    mapRef.current=map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);
    dataLayerRef.current=L.layerGroup().addTo(map);
    let disposed=false;
    const refreshSize=()=>{if(disposed||!mapRef.current)return;try{map.invalidateSize({pan:false})}catch{/* map is already leaving the page */}};
    const animationFrame=requestAnimationFrame(refreshSize);
    const firstTimer=setTimeout(refreshSize,120);
    const secondTimer=setTimeout(refreshSize,450);
    const observer=typeof ResizeObserver === "function" ? new ResizeObserver(refreshSize) : null;
    observer?.observe(elementRef.current);
    return()=>{disposed=true;mapRef.current=null;dataLayerRef.current=null;cancelAnimationFrame(animationFrame);clearTimeout(firstTimer);clearTimeout(secondTimer);observer?.disconnect();try{map.off();map.remove()}catch{/* Leaflet may already be detached by React */}};
  },[]);

  useEffect(()=>{
    const map=mapRef.current,group=dataLayerRef.current;
    if(!map||!group)return;
    group.clearLayers();
    const safeVillages=Array.isArray(villages)?villages.filter(Boolean):[];
    const safeItems=Array.isArray(items)?items.filter(Boolean):[];
    const counts=Object.fromEntries(safeVillages.map(v=>[Number(v.villageNo),Number(v.totalPets||0)]));
    const max=Math.max(1,...Object.values(counts));
    MAP_VILLAGES.forEach(v=>{const total=counts[v.id]||0;const layer=L.polygon(v.polygon,{color:"#fff",weight:2,fillColor:colorForCount(total,max),fillOpacity:.82}).addTo(group);layer.bindTooltip(`${v.name} · ${total} ตัว`,{permanent:true,direction:"center",className:"village-map-label"});layer.on("click",()=>{if(mapRef.current)map.flyTo(v.center,17,{duration:.5})})});
    safeItems.forEach((item,index)=>{const supplied=[Number(item.latitude),Number(item.longitude)];const position=supplied.every(Number.isFinite)&&supplied[0]&&supplied[1]?supplied:fallbackPosition(item.villageNo,index);const color=item.species==="DOG"?"#e89c23":"#3982bb";const icon=L.divIcon({className:"pet-map-marker",html:`<span style="--marker:${color}"><b>${item.species==="DOG"?"ส":"ม"}</b></span>`,iconSize:[28,34],iconAnchor:[14,30]});L.marker(position,{icon}).addTo(group).bindPopup(popupNode(item))});
  },[items,villages]);
  return <section className="dashboard-map panel"><div className="panel-head"><div><h2>แผนที่ภาพรวมเทศบาลท่าโพธ์</h2><p>ตำแหน่งสัตว์ขึ้นทะเบียนและจำนวนรายหมู่บ้าน</p></div><div className="map-legend"><span><i className="dog-dot"/>สุนัข</span><span><i className="cat-dot"/>แมว</span></div></div><div ref={elementRef} className="leaflet-dashboard-map"/><div className="map-foot"><span>กดหมู่บ้านเพื่อขยายพื้นที่</span><span>แสดงสัตว์ที่อนุมัติทะเบียนแล้ว {items.length} ตัว</span></div></section>
}

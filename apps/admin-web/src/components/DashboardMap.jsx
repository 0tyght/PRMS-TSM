import { MAP_BOUNDS, MAP_VILLAGES } from "../lib/mapData.js";

const latitudes=MAP_BOUNDS.map(([lat])=>lat);
const longitudes=MAP_BOUNDS.map(([,lng])=>lng);
const minLat=Math.min(...latitudes),maxLat=Math.max(...latitudes),minLng=Math.min(...longitudes),maxLng=Math.max(...longitudes);
const mapUrl=`https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=16.755%2C100.195`;

function markerPosition([lat,lng]){return{left:`${((lng-minLng)/(maxLng-minLng))*100}%`,top:`${((maxLat-lat)/(maxLat-minLat))*100}%`}}

export default function DashboardMap({items=[],villages=[]}){
  const safeVillages=Array.isArray(villages)?villages.filter(Boolean):[];
  const counts=Object.fromEntries(safeVillages.map(v=>[Number(v.villageNo),Number(v.totalPets||0)]));
  return <section className="dashboard-map panel"><div className="panel-head"><div><h2>แผนที่ภาพรวมเทศบาลท่าโพธ์</h2><p>จำนวนสัตว์ขึ้นทะเบียนแยกรายหมู่บ้าน</p></div><div className="map-legend"><span><i className="dog-dot"/>สุนัข</span><span><i className="cat-dot"/>แมว</span></div></div><div className="leaflet-dashboard-map map-embed-wrap"><iframe src={mapUrl} title="แผนที่เทศบาลท่าโพธ์" loading="lazy" referrerPolicy="no-referrer-when-downgrade"/><div className="map-village-overlay" aria-hidden="true">{MAP_VILLAGES.map(v=><span key={v.id} style={markerPosition(v.center)}><b>{v.id}</b><em>{counts[v.id]||0}</em></span>)}</div></div><div className="map-foot"><span>เลื่อนและขยายแผนที่ได้โดยตรง</span><span>แสดงสัตว์ที่อนุมัติทะเบียนแล้ว {Array.isArray(items)?items.length:0} ตัว</span></div></section>;
}

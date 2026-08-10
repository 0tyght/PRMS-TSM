import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const THA_PHO_CENTER = [16.7744, 100.2254];

function toPoints(value) {
  const coordinates = value?.type === "Feature" ? value.geometry?.coordinates : value?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
    .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
}

function toGeojson(points) {
  if (points.length < 2) return null;
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: points.map(([latitude, longitude]) => [longitude, latitude]) },
  };
}

export default function RouteEditor({ value, onChange }) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  const [points, setPoints] = useState(() => toPoints(value));

  useEffect(() => {
    if (!rootRef.current) return undefined;
    const map = L.map(rootRef.current, { zoomControl: true, scrollWheelZoom: false }).setView(THA_PHO_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    map.on("click", (event) => setPoints((current) => [...current, [event.latlng.lat, event.latlng.lng]]));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const layer = L.layerGroup().addTo(map);
    if (points.length) {
      const line = L.polyline(points, { color: "#c66d16", weight: 5, opacity: 0.84 }).addTo(layer);
      points.forEach((point, index) => L.circleMarker(point, { radius: 8, color: "#fff", weight: 2, fillColor: "#a8540e", fillOpacity: 1 }).bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "waste-route-point" }).addTo(layer));
      if (points.length > 1) map.fitBounds(line.getBounds(), { padding: [26, 26], maxZoom: 16 });
    }
    return () => layer.remove();
  }, [points]);

  useEffect(() => { onChange(toGeojson(points)); }, [onChange, points]);

  return <section className="waste-route-editor">
    <header><div><strong>กำหนดแนวเส้นทางบนแผนที่</strong><span>คลิกบนถนนตามลำดับการวิ่งเก็บขยะอย่างน้อย 2 จุด</span></div><b>{points.length} จุด</b></header>
    <div className="waste-route-editor__map" ref={rootRef} aria-label="แผนที่กำหนดเส้นทางเก็บขยะในเทศบาลท่าโพธ์" />
    <footer><button type="button" className="waste-button waste-button--secondary" disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}>ย้อนกลับ 1 จุด</button><button type="button" className="waste-button waste-button--quiet" disabled={!points.length} onClick={() => setPoints([])}>ล้างแนวเส้นทาง</button></footer>
  </section>;
}

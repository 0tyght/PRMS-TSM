import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useLeafletResize from "../lib/useLeafletResize.js";

const THA_PHO_CENTER = [16.7744, 100.2254];

export default function LocationPicker({ latitude, longitude, onChange }) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!rootRef.current) return undefined;
    const hasPoint = Number.isFinite(latitude) && Number.isFinite(longitude);
    const map = L.map(rootRef.current, { zoomControl: true, scrollWheelZoom: false })
      .setView(hasPoint ? [latitude, longitude] : THA_PHO_CENTER, hasPoint ? 17 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    map.on("click", (event) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  useLeafletResize(mapRef, rootRef);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    markerRef.current = L.circleMarker([latitude, longitude], {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: "#278432",
      fillOpacity: 1,
    }).addTo(map).bindTooltip("จุดรับบริการ", { direction: "top" });
    map.panTo([latitude, longitude]);
  }, [latitude, longitude]);

  return <section className="waste-location-picker">
    <header>
      <div><strong>ตำแหน่งจุดรับบริการ</strong><span>คลิกตำแหน่งบ้านหรือสถานที่บนแผนที่</span></div>
      {Number.isFinite(latitude) && Number.isFinite(longitude) ? <button type="button" className="waste-button waste-button--quiet" onClick={() => onChange({ latitude: null, longitude: null })}>ล้างตำแหน่ง</button> : null}
    </header>
    <div ref={rootRef} className="waste-location-picker__map" aria-label="แผนที่เลือกตำแหน่งผู้ใช้บริการเก็บขยะ" />
    <footer>{Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "ยังไม่ได้เลือกตำแหน่ง"}</footer>
  </section>;
}

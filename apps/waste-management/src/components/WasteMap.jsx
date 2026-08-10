import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const THA_PHO_CENTER = [16.7744, 100.2254];

export default function WasteMap({ plans = [], routeGeojson = null, routeStops = [], history = [] }) {
  const rootRef = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    if (!rootRef.current) return undefined;
    const map = L.map(rootRef.current, { zoomControl: true, scrollWheelZoom: false }).setView(THA_PHO_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const layer = L.layerGroup().addTo(map);
    const points = [];
    if (routeGeojson) {
      const routeLayer = L.geoJSON(routeGeojson, { style: { color: "#c66d16", weight: 5, opacity: 0.78 } }).addTo(layer);
      const bounds = routeLayer.getBounds(); if (bounds.isValid()) points.push(bounds.getSouthWest(), bounds.getNorthEast());
    }
    routeStops.forEach((stop, index) => {
      const latitude = Number(stop.latitude); const longitude = Number(stop.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const marker = L.circleMarker([latitude, longitude], { radius: 8, weight: 2, color: "#fff", fillColor: stop.confirmationStatus === "COLLECTED" ? "#17825f" : "#c66d16", fillOpacity: 1 }).addTo(layer);
      marker.bindTooltip(String(stop.sequenceNo || index + 1), { permanent: true, direction: "center", className: "waste-route-point" });
      marker.bindPopup(`<strong>${stop.stopName || "จุดเก็บขยะ"}</strong>`);
      points.push([latitude, longitude]);
    });
    const historyLine = history.map((point) => [Number(point.latitude), Number(point.longitude)]).filter((point) => point.every(Number.isFinite));
    if (historyLine.length > 1) { L.polyline(historyLine, { color: "#1f8d69", weight: 4, opacity: 0.82 }).addTo(layer); points.push(...historyLine); }
    plans.forEach((plan) => { const latitude = Number(plan.latitude); const longitude = Number(plan.longitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return; const marker = L.circleMarker([latitude, longitude], { radius: 10, weight: 3, color: "#fff", fillColor: plan.status === "IN_PROGRESS" ? "#10825d" : "#c66d16", fillOpacity: 1 }).addTo(layer); marker.bindPopup(`<strong>${plan.vehicleCode || "รถเก็บขยะ"}</strong><br>${plan.routeName || "ไม่ระบุเส้นทาง"}<br>${plan.driverName || "ไม่ระบุคนขับ"}`); points.push([latitude, longitude]); });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 16 });
    return () => layer.remove();
  }, [plans, routeGeojson, routeStops, history]);
  return <div className="waste-map" ref={rootRef} aria-label="แผนที่ติดตามรถเก็บขยะ" />;
}
